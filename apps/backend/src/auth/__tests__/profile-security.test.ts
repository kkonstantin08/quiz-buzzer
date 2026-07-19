import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { jest } from '@jest/globals';
import { LegalDocumentType, legalBackendConfig } from '../../legal/config';
import { prisma } from '../../prisma';
import { authRouter } from '../index';

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json());
app.use(cookieParser());
app.use('/auth', authRouter);

const prefix = `profile-security-${Date.now()}`;
const password = 'password123';
const userIds = new Set<string>();
let requestNumber = 1;

function post(path: string) {
  return request(app).post(path).set('X-Forwarded-For', `198.51.100.${requestNumber++}`);
}

function put(path: string) {
  return request(app).put(path).set('X-Forwarded-For', `198.51.100.${requestNumber++}`);
}

function putFrom(ip: string, path: string) {
  return request(app).put(path).set('X-Forwarded-For', ip);
}

function postFrom(ip: string, path: string) {
  return request(app).post(path).set('X-Forwarded-For', ip);
}

function email(label: string) {
  return `${prefix}-${label}@example.com`;
}

function hostCookie(response: request.Response) {
  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.find((cookie) => cookie.startsWith('hostToken=')) ?? '';
}

function sessionIdFromCookie(cookie: string) {
  const token = cookie.match(/hostToken=([^;]+)/)?.[1];
  const decoded = token ? jwt.decode(decodeURIComponent(token)) : null;
  if (!decoded || typeof decoded === 'string' || typeof decoded.sessionId !== 'string') {
    throw new Error('Expected session cookie');
  }
  return decoded.sessionId;
}

function compareBarrier(count: number) {
  let arrived = 0;
  let ready!: () => void;
  let release!: () => void;
  const allArrived = new Promise<void>((resolve) => { ready = resolve; });
  const continueComparisons = new Promise<void>((resolve) => { release = resolve; });
  return {
    async wait() {
      arrived += 1;
      if (arrived === count) ready();
      await continueComparisons;
    },
    allArrived,
    release,
  };
}

async function createUser(userEmail: string, userPassword = password) {
  const user = await prisma.hostUser.create({
    data: { email: userEmail, passwordHash: await bcrypt.hash(userPassword, 10) },
  });
  userIds.add(user.id);
  return user;
}

async function trackRegisteredUser(userEmail: string) {
  const user = await prisma.hostUser.findUnique({ where: { email: userEmail } });
  if (user) userIds.add(user.id);
}

afterEach(async () => {
  jest.restoreAllMocks();
  for (const userId of userIds) {
    await prisma.legalAcceptance.deleteMany({ where: { hostUserId: userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.hostUser.deleteMany({ where: { id: userId } });
  }
  userIds.clear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('profile security', () => {
  it('stores a trimmed lowercase email at registration and logs in with different casing', async () => {
    const rawEmail = `  ${email('registered').toUpperCase()}  `;
    const canonicalEmail = email('registered');

    const registration = await post('/auth/register').send({
      email: rawEmail,
      password,
      termsAccepted: true,
      displayedTermsVersion: legalBackendConfig.versions[LegalDocumentType.TERMS],
    });

    expect(registration.status).toBe(200);
    expect(registration.body.email).toBe(canonicalEmail);
    await trackRegisteredUser(canonicalEmail);
    await expect(prisma.hostUser.findUnique({ where: { email: canonicalEmail } })).resolves.toBeTruthy();

    await post('/auth/login').send({ email: rawEmail, password }).expect(200);
  });

  it('prevents case-only duplicate registrations even when requests race', async () => {
    const canonicalEmail = email('race');
    const payload = {
      password,
      termsAccepted: true,
      displayedTermsVersion: legalBackendConfig.versions[LegalDocumentType.TERMS],
    };

    const responses = await Promise.all([
      post('/auth/register').send({ ...payload, email: canonicalEmail }),
      post('/auth/register').send({ ...payload, email: canonicalEmail.toUpperCase() }),
    ]);

    await trackRegisteredUser(canonicalEmail);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    await expect(prisma.hostUser.count({ where: { email: canonicalEmail } })).resolves.toBe(1);
  });

  it('allows legacy mixed-case email accounts to log in', async () => {
    const legacyEmail = `${prefix}-Legacy@Example.COM`;
    await createUser(legacyEmail);

    await post('/auth/login')
      .send({ email: ` ${legacyEmail.toLowerCase()} `, password })
      .expect(200);
  });

  it('uses an exact legacy email match and fails closed for an ambiguous fallback', async () => {
    const firstEmail = `${prefix}-User@Example.com`;
    const secondEmail = `${prefix}-user@example.com`;
    await createUser(firstEmail, 'first-password123');
    await createUser(secondEmail, 'second-password123');
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await post('/auth/login').send({ email: firstEmail, password: 'first-password123' }).expect(200);
    await post('/auth/login').send({ email: secondEmail, password: 'second-password123' }).expect(200);
    await post('/auth/login').send({ email: `${prefix}-USER@example.com`, password: 'first-password123' }).expect(401);

    expect(warning).toHaveBeenCalledWith(JSON.stringify({ event: 'ambiguous_legacy_email', matchCount: 2 }));
  });

  it('rejects registration and email changes to an ambiguous legacy canonical email', async () => {
    const legacyEmail = `${prefix}-User@Example.com`;
    await createUser(legacyEmail);
    await createUser(legacyEmail.toLowerCase());
    const source = await createUser(email('ambiguous-email-source'));
    const login = await post('/auth/login').send({ email: source.email, password }).expect(200);

    await post('/auth/register').send({
      email: legacyEmail.toUpperCase(),
      password,
      termsAccepted: true,
      displayedTermsVersion: legalBackendConfig.versions[LegalDocumentType.TERMS],
    }).expect(400);
    await put('/auth/me').set('Cookie', hostCookie(login)).send({ email: legacyEmail.toUpperCase(), currentPassword: password }).expect(400);
  });

  it('does not create a session when the verified login hash changes before session creation', async () => {
    const user = await createUser(email('login-race'));
    const compare = bcrypt.compare.bind(bcrypt);
    jest.spyOn(bcrypt, 'compare').mockImplementationOnce(async (candidate, hash) => {
      const result = await compare(candidate, hash);
      await prisma.hostUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash('changed-password123', 10) } });
      return result;
    });

    await post('/auth/login').send({ email: user.email, password }).expect(401);
    await expect(prisma.session.count({ where: { userId: user.id, revokedAt: null } })).resolves.toBe(0);
  });

  it('does not update email when the current session is revoked after password verification', async () => {
    const user = await createUser(email('email-session-race'));
    const login = await post('/auth/login').send({ email: user.email, password }).expect(200);
    const cookie = hostCookie(login);
    const compare = bcrypt.compare.bind(bcrypt);
    jest.spyOn(bcrypt, 'compare').mockImplementationOnce(async (candidate, hash) => {
      const result = await compare(candidate, hash);
      await prisma.session.update({ where: { id: sessionIdFromCookie(cookie) }, data: { revokedAt: new Date() } });
      return result;
    });

    await put('/auth/me').set('Cookie', cookie).send({ email: email('email-session-race-new'), currentPassword: password }).expect(400);
    await expect(prisma.hostUser.findUnique({ where: { id: user.id } })).resolves.toMatchObject({ email: user.email });
  });

  it('does not update the password when the verified hash changes before its transaction', async () => {
    const user = await createUser(email('password-hash-race'));
    const login = await post('/auth/login').send({ email: user.email, password }).expect(200);
    const cookie = hostCookie(login);
    const replacementPassword = 'replacement-password123';
    const compare = bcrypt.compare.bind(bcrypt);
    jest.spyOn(bcrypt, 'compare').mockImplementationOnce(async (candidate, hash) => {
      const result = await compare(candidate, hash);
      await prisma.hostUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(replacementPassword, 10) } });
      return result;
    });

    await post('/auth/change-password').set('Cookie', cookie).send({ currentPassword: password, newPassword: 'new-password123' }).expect(400);
    const changedUser = await prisma.hostUser.findUniqueOrThrow({ where: { id: user.id } });
    await expect(bcrypt.compare(replacementPassword, changedUser.passwordHash)).resolves.toBe(true);
  });

  it('does not update the password or revoke other sessions after the current session is revoked', async () => {
    const user = await createUser(email('password-session-race'));
    const currentLogin = await post('/auth/login').send({ email: user.email, password }).expect(200);
    const otherLogin = await post('/auth/login').send({ email: user.email, password }).expect(200);
    const currentCookie = hostCookie(currentLogin);
    const compare = bcrypt.compare.bind(bcrypt);
    jest.spyOn(bcrypt, 'compare').mockImplementationOnce(async (candidate, hash) => {
      const result = await compare(candidate, hash);
      await prisma.session.update({ where: { id: sessionIdFromCookie(currentCookie) }, data: { revokedAt: new Date() } });
      return result;
    });

    await post('/auth/change-password').set('Cookie', currentCookie).send({ currentPassword: password, newPassword: 'new-password123' }).expect(400);
    await post('/auth/login').send({ email: user.email, password }).expect(200);
    await request(app).get('/auth/me').set('Cookie', hostCookie(otherLogin)).expect(200);
  });

  it('allows only one of two concurrent password changes verified against the same hash', async () => {
    const user = await createUser(email('parallel-password'));
    const login = await post('/auth/login').send({ email: user.email, password }).expect(200);
    const cookie = hostCookie(login);
    const barrier = compareBarrier(2);
    const compare = bcrypt.compare.bind(bcrypt);
    jest.spyOn(bcrypt, 'compare').mockImplementation(async (candidate, hash) => {
      const result = await compare(candidate, hash);
      if (candidate === password && result) await barrier.wait();
      return result;
    });

    const first = post('/auth/change-password').set('Cookie', cookie).send({ currentPassword: password, newPassword: 'first-password123' }).then((response) => response);
    const second = post('/auth/change-password').set('Cookie', cookie).send({ currentPassword: password, newPassword: 'second-password123' }).then((response) => response);
    await barrier.allArrived;
    barrier.release();
    const responses = await Promise.all([first, second]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    const changedUser = await prisma.hostUser.findUniqueOrThrow({ where: { id: user.id } });
    const matches = await Promise.all([
      bcrypt.compare('first-password123', changedUser.passwordHash),
      bcrypt.compare('second-password123', changedUser.passwordHash),
    ]);
    expect(matches.filter(Boolean)).toHaveLength(1);
  });

  it('leaves email and password in a consistent state when both are verified concurrently', async () => {
    const user = await createUser(email('email-password-race'));
    const login = await post('/auth/login').send({ email: user.email, password }).expect(200);
    const cookie = hostCookie(login);
    const newEmail = email('email-password-race-new');
    const newPassword = 'new-password123';
    const barrier = compareBarrier(2);
    const compare = bcrypt.compare.bind(bcrypt);
    jest.spyOn(bcrypt, 'compare').mockImplementation(async (candidate, hash) => {
      const result = await compare(candidate, hash);
      if (candidate === password && result) await barrier.wait();
      return result;
    });

    const emailChange = put('/auth/me').set('Cookie', cookie).send({ email: newEmail, currentPassword: password }).then((response) => response);
    const passwordChange = post('/auth/change-password').set('Cookie', cookie).send({ currentPassword: password, newPassword }).then((response) => response);
    await barrier.allArrived;
    barrier.release();
    const [emailResponse, passwordResponse] = await Promise.all([emailChange, passwordChange]);

    expect([200, 400]).toContain(emailResponse.status);
    expect([200, 400]).toContain(passwordResponse.status);
    expect(emailResponse.status === 200 || passwordResponse.status === 200).toBe(true);
    const changedUser = await prisma.hostUser.findUniqueOrThrow({ where: { id: user.id } });
    expect(changedUser.email).toBe(emailResponse.status === 200 ? newEmail : user.email);
    if (passwordResponse.status === 200) await expect(bcrypt.compare(newPassword, changedUser.passwordHash)).resolves.toBe(true);
    else await expect(bcrypt.compare(password, changedUser.passwordHash)).resolves.toBe(true);
  });

  it('does not count correct current passwords when a later email update is rejected', async () => {
    const user = await createUser(email('limit-conflict'));
    const occupied = await createUser(email('limit-conflict-occupied'));
    const login = await post('/auth/login').send({ email: user.email, password }).expect(200);
    const cookie = hostCookie(login);
    const ip = '198.51.100.210';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await putFrom(ip, '/auth/me').set('Cookie', cookie).send({ email: occupied.email, currentPassword: password }).expect(400);
    }
    await putFrom(ip, '/auth/me').set('Cookie', cookie).send({ email: email('limit-conflict-new'), currentPassword: 'wrong-password' }).expect(400);
  });

  it('does not count malformed password changes or database failures as wrong current passwords', async () => {
    const user = await createUser(email('limit-non-password-failures'));
    const login = await post('/auth/login').send({ email: user.email, password }).expect(200);
    const cookie = hostCookie(login);
    const ip = '198.51.100.211';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await postFrom(ip, '/auth/change-password').set('Cookie', cookie).send({ currentPassword: password, newPassword: 'short' }).expect(400);
    }
    const transaction = jest.spyOn(prisma, '$transaction').mockRejectedValue(new Error('database failed'));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await postFrom(ip, '/auth/change-password').set('Cookie', cookie).send({ currentPassword: password, newPassword: 'new-password123' }).expect(500);
    }
    transaction.mockRestore();
    await postFrom(ip, '/auth/change-password').set('Cookie', cookie).send({ currentPassword: 'wrong-password', newPassword: 'new-password123' }).expect(400);
  });

  it.each([
    { label: 'registration', path: '/auth/register', payload: { password, termsAccepted: true, displayedTermsVersion: legalBackendConfig.versions[LegalDocumentType.TERMS] } },
    { label: 'login', path: '/auth/login', payload: { password } },
  ])('rejects non-string, invalid, and overlong email at $label', async ({ path, payload }) => {
    for (const invalidEmail of [{ address: email('object') }, 'missing-at-sign', `${'a'.repeat(250)}@example.com`]) {
      await post(path).send({ ...payload, email: invalidEmail }).expect(400);
    }
  });

  it('trims names, stores empty names as null, and rejects invalid name values', async () => {
    const userEmail = email('name');
    await createUser(userEmail);
    const login = await post('/auth/login').send({ email: userEmail, password }).expect(200);
    const cookie = hostCookie(login);

    await put('/auth/me').set('Cookie', cookie).send({ name: '  Ada Lovelace  ' }).expect(200).expect({
      hasActiveSubscription: false,
      email: userEmail,
      name: 'Ada Lovelace',
      avatarUrl: null,
      customLogoUrl: null,
      subscription: null,
    });
    await put('/auth/me').set('Cookie', cookie).send({ name: '   ' }).expect(200).expect('Content-Type', /json/);
    await expect(prisma.hostUser.findUnique({ where: { email: userEmail } })).resolves.toMatchObject({ name: null });

    for (const invalidName of [{ name: 'Ada' }, ['Ada'], 42, 'a'.repeat(81)]) {
      await put('/auth/me').set('Cookie', cookie).send({ name: invalidName }).expect(400);
    }
  });

  it('requires the current password before changing email', async () => {
    const oldEmail = email('old');
    const newEmail = `  ${email('new').toUpperCase()}  `;
    const canonicalNewEmail = email('new');
    await createUser(oldEmail);
    const login = await post('/auth/login').send({ email: oldEmail, password }).expect(200);
    const cookie = hostCookie(login);

    await put('/auth/me').set('Cookie', cookie).send({ email: newEmail }).expect(400);
    await put('/auth/me').set('Cookie', cookie).send({ email: newEmail, currentPassword: 'incorrect-password' }).expect(400);
    await expect(prisma.hostUser.findUnique({ where: { email: oldEmail } })).resolves.toBeTruthy();

    const update = await put('/auth/me')
      .set('Cookie', cookie)
      .send({ email: newEmail, currentPassword: password })
      .expect(200);

    expect(update.body.email).toBe(canonicalNewEmail);
    await expect(prisma.hostUser.findUnique({ where: { email: canonicalNewEmail } })).resolves.toBeTruthy();
  });

  it('keeps the current session and revokes other sessions after an email change', async () => {
    const oldEmail = email('session-email');
    const newEmail = email('session-email-new');
    await createUser(oldEmail);
    const currentLogin = await post('/auth/login').send({ email: oldEmail, password }).expect(200);
    const otherLogin = await post('/auth/login').send({ email: oldEmail, password }).expect(200);
    const currentCookie = hostCookie(currentLogin);
    const otherCookie = hostCookie(otherLogin);
    const currentSessionId = sessionIdFromCookie(currentCookie);

    await put('/auth/me')
      .set('Cookie', currentCookie)
      .send({ email: newEmail, currentPassword: password })
      .expect(200);

    await request(app).get('/auth/me').set('Cookie', currentCookie).expect(200);
    await request(app).get('/auth/me').set('Cookie', otherCookie).expect(401);
    await expect(prisma.session.findUnique({ where: { id: currentSessionId } })).resolves.toMatchObject({ revokedAt: null });
    await expect(prisma.session.findMany({ where: { userId: (await prisma.hostUser.findUnique({ where: { email: newEmail } }))!.id } }))
      .resolves.toEqual(expect.arrayContaining([expect.objectContaining({ revokedAt: expect.any(Date) })]));
  });

  it('changes the password atomically and leaves the current session active', async () => {
    const userEmail = email('password');
    const newPassword = 'new-password123';
    await createUser(userEmail);
    const currentLogin = await post('/auth/login').send({ email: userEmail, password }).expect(200);
    const otherLogin = await post('/auth/login').send({ email: userEmail, password }).expect(200);
    const currentCookie = hostCookie(currentLogin);
    const otherCookie = hostCookie(otherLogin);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    for (const body of [
      { currentPassword: 'wrong-password', newPassword },
      { currentPassword: password, newPassword: 'short' },
      { currentPassword: password, newPassword: 'a'.repeat(129) },
      { currentPassword: password, newPassword: password },
      { currentPassword: { value: password }, newPassword },
      { currentPassword: password, newPassword: { value: newPassword } },
    ]) {
      await post('/auth/change-password').set('Cookie', currentCookie).send(body).expect(400);
    }

    const response = await post('/auth/change-password')
      .set('Cookie', currentCookie)
      .send({ currentPassword: password, newPassword })
      .expect(200);
    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(JSON.stringify(response.body)).not.toContain('hash');
    expect(consoleError).not.toHaveBeenCalled();

    await request(app).get('/auth/me').set('Cookie', currentCookie).expect(200);
    await request(app).get('/auth/me').set('Cookie', otherCookie).expect(401);
    await post('/auth/login').send({ email: userEmail, password }).expect(401);
    await post('/auth/login').send({ email: userEmail, password: newPassword }).expect(200);
  });

  it('rolls back an email update and session revocation if its transaction fails', async () => {
    const oldEmail = email('rollback');
    const newEmail = email('rollback-new');
    await createUser(oldEmail);
    const currentLogin = await post('/auth/login').send({ email: oldEmail, password }).expect(200);
    const otherLogin = await post('/auth/login').send({ email: oldEmail, password }).expect(200);
    const transaction = jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('transaction failed'));

    await put('/auth/me')
      .set('Cookie', hostCookie(currentLogin))
      .send({ email: newEmail, currentPassword: password })
      .expect(500);

    expect(transaction).toHaveBeenCalledTimes(1);
    await expect(prisma.hostUser.findUnique({ where: { email: oldEmail } })).resolves.toBeTruthy();
    await request(app).get('/auth/me').set('Cookie', hostCookie(otherLogin)).expect(200);
  });

  it('rolls back a password update and session revocation if its transaction fails', async () => {
    const userEmail = email('password-rollback');
    const newPassword = 'new-password123';
    await createUser(userEmail);
    const currentLogin = await post('/auth/login').send({ email: userEmail, password }).expect(200);
    const otherLogin = await post('/auth/login').send({ email: userEmail, password }).expect(200);
    const transaction = jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('transaction failed'));

    await post('/auth/change-password')
      .set('Cookie', hostCookie(currentLogin))
      .send({ currentPassword: password, newPassword })
      .expect(500);

    expect(transaction).toHaveBeenCalledTimes(1);
    await post('/auth/login').send({ email: userEmail, password }).expect(200);
    await post('/auth/login').send({ email: userEmail, password: newPassword }).expect(401);
    await request(app).get('/auth/me').set('Cookie', hostCookie(otherLogin)).expect(200);
  });

  it('limits failed current-password checks per session and IP without limiting name updates', async () => {
    const firstEmail = email('limit-first');
    const secondEmail = email('limit-second');
    await createUser(firstEmail);
    await createUser(secondEmail);
    const firstLogin = await post('/auth/login').send({ email: firstEmail, password }).expect(200);
    const secondLogin = await post('/auth/login').send({ email: secondEmail, password }).expect(200);
    const firstCookie = hostCookie(firstLogin);
    const secondCookie = hostCookie(secondLogin);
    const ip = '198.51.100.200';

    await putFrom(ip, '/auth/me').set('Cookie', firstCookie).send({ name: 'Ada' }).expect(200);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await putFrom(ip, '/auth/me').set('Cookie', firstCookie).send({ email: email('limit-new'), currentPassword: 'wrong-password' }).expect(400);
    }
    await putFrom(ip, '/auth/me').set('Cookie', firstCookie).send({ email: email('limit-new'), currentPassword: 'wrong-password' }).expect(429);
    await putFrom(ip, '/auth/me').set('Cookie', firstCookie).send({ name: 'Grace' }).expect(200);
    await putFrom(ip, '/auth/me').set('Cookie', secondCookie).send({ email: email('limit-new'), currentPassword: 'wrong-password' }).expect(400);
  });

  it('limits failed password changes per session and IP', async () => {
    const userEmail = email('password-limit');
    await createUser(userEmail);
    const login = await post('/auth/login').send({ email: userEmail, password }).expect(200);
    const cookie = hostCookie(login);
    const ip = '198.51.100.201';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await postFrom(ip, '/auth/change-password').set('Cookie', cookie).send({ currentPassword: 'wrong-password', newPassword: 'new-password123' }).expect(400);
    }
    await postFrom(ip, '/auth/change-password').set('Cookie', cookie).send({ currentPassword: 'wrong-password', newPassword: 'new-password123' }).expect(429);
  });
});
