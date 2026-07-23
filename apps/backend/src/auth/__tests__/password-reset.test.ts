import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { createHash } from 'crypto';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { Resend } from 'resend';
import { config } from '../../config';
import { prisma } from '../../prisma';
import { authRouter, createPasswordResetEmailLimiter, createPasswordResetIpLimiter } from '../index';

const mockSend = jest.fn<(message: { text?: string }) => Promise<{ data: { id: string }; error: null }>>();
jest.mock('resend', () => ({ Resend: jest.fn() }));

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json());
app.use(cookieParser());
app.use('/auth', authRouter);

const email = `password-reset-${Date.now()}@example.com`;
const userIds = new Set<string>();
let requestNumber = 1;
const originalConfig = {
  resendApiKey: config.resendApiKey,
  mailFrom: config.mailFrom,
  appPublicUrl: config.appPublicUrl,
  passwordResetTokenTtlMinutes: config.passwordResetTokenTtlMinutes,
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function emailAddress(label: string) {
  return `password-reset-${Date.now()}-${label}@example.com`;
}

function requestReset(address: string) {
  return request(app)
    .post('/auth/forgot-password')
    .set('X-Forwarded-For', `198.51.100.${requestNumber++}`)
    .send({ email: address });
}

function resetUrlToken() {
  const message = mockSend.mock.calls.at(-1)?.[0];
  const token = typeof message?.text === 'string' ? message.text.match(/token=([^\s]+)/)?.[1] : undefined;
  if (!token) throw new Error('Expected reset token in email');
  return decodeURIComponent(token);
}

async function createUser(address = emailAddress('user')) {
  const user = await prisma.hostUser.create({ data: { email: address, passwordHash: await bcrypt.hash('password123', 10) } });
  userIds.add(user.id);
  return user;
}

beforeEach(() => {
  config.resendApiKey = 're_test';
  config.mailFrom = 'КвизПульт <noreply@qbuz.ru>';
  config.appPublicUrl = 'https://qbuz.ru';
  config.passwordResetTokenTtlMinutes = 30;
  mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null });
  (Resend as unknown as jest.Mock).mockImplementation(() => ({ emails: { send: mockSend } }));
});

afterEach(async () => {
  jest.clearAllMocks();
  for (const userId of userIds) await prisma.hostUser.deleteMany({ where: { id: userId } });
  userIds.clear();
});

afterAll(async () => {
  Object.assign(config, originalConfig);
  await prisma.$disconnect();
});

describe('password reset', () => {
  it('returns the same confirmation for existing and missing email addresses', async () => {
    await createUser(email);

    const existing = await requestReset(email);
    const missing = await requestReset(emailAddress('missing'));

    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(existing.body).toEqual({ message: 'Если аккаунт с таким email существует, мы отправили инструкции по восстановлению пароля' });
    expect(missing.body).toEqual(existing.body);
  });

  it('stores only a hash and sends the reset link through Resend', async () => {
    const user = await createUser();

    await requestReset(user.email).expect(200);

    const token = resetUrlToken();
    const stored = await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      from: 'КвизПульт <noreply@qbuz.ru>',
      to: [user.email],
      subject: 'Восстановление пароля — КвизПульт',
    }));
  });

  it('rejects expired and reused tokens without changing the password', async () => {
    const user = await createUser();
    await requestReset(user.email).expect(200);
    const token = resetUrlToken();
    await prisma.passwordResetToken.update({ where: { tokenHash: hashToken(token) }, data: { expiresAt: new Date(Date.now() - 1) } });

    await request(app).post('/auth/reset-password').send({ token, newPassword: 'new-password123' }).expect(400);
    await expect(bcrypt.compare('password123', (await prisma.hostUser.findUniqueOrThrow({ where: { id: user.id } })).passwordHash)).resolves.toBe(true);

    await requestReset(user.email).expect(200);
    const validToken = resetUrlToken();
    await request(app).post('/auth/reset-password').send({ token: validToken, newPassword: 'new-password123' }).expect(200);
    await request(app).post('/auth/reset-password').send({ token: validToken, newPassword: 'another-password123' }).expect(400);
  });

  it('revokes every session and clears the auth cookie after a successful reset', async () => {
    const user = await createUser();
    await request(app).post('/auth/login').send({ email: user.email, password: 'password123' }).expect(200);
    await request(app).post('/auth/login').send({ email: user.email, password: 'password123' }).expect(200);
    await requestReset(user.email).expect(200);

    const response = await request(app).post('/auth/reset-password').send({ token: resetUrlToken(), newPassword: 'new-password123' }).expect(200);
    expect(response.headers['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('hostToken=;')]));
    await expect(bcrypt.compare('new-password123', (await prisma.hostUser.findUniqueOrThrow({ where: { id: user.id } })).passwordHash)).resolves.toBe(true);
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id, usedAt: null } })).toBe(0);
  });

  it('limits both requests from one IP and repeated normalized email requests', async () => {
    const limiterApp = express();
    limiterApp.set('trust proxy', 'loopback');
    limiterApp.use(express.json());
    limiterApp.post('/ip', createPasswordResetIpLimiter(), (_req, res) => res.json({ ok: true }));
    limiterApp.post('/email', createPasswordResetEmailLimiter(), (_req, res) => res.json({ ok: true }));

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(limiterApp).post('/ip').set('X-Forwarded-For', '198.51.100.200').send({ email: emailAddress(String(attempt)) }).expect(200);
    }
    await request(limiterApp).post('/ip').set('X-Forwarded-For', '198.51.100.200').send({ email: emailAddress('blocked-ip') }).expect(429);

    const limitedEmail = emailAddress('limited').toUpperCase();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(limiterApp).post('/email').set('X-Forwarded-For', `198.51.100.${attempt}`).send({ email: limitedEmail }).expect(200);
    }
    await request(limiterApp).post('/email').set('X-Forwarded-For', '198.51.100.99').send({ email: limitedEmail.toLowerCase() }).expect(429);
  });
});
