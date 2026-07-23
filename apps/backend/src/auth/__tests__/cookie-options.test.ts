import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { config, loadConfig } from '../../config';
import { legalBackendConfig, LegalDocumentType } from '../../legal/config';
import { prisma } from '../../prisma';
import { authRouter } from '../index';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/auth', authRouter);

const testEmail = `cookie-options-${Date.now()}@example.com`;
const registerEmail = `cookie-register-${Date.now()}@example.com`;
const testPassword = 'password123';

function hostCookie(response: request.Response) {
  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.find((cookie) => cookie.startsWith('hostToken=')) ?? '';
}

function expectCookieOptions(cookie: string, secure: boolean) {
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Lax');
  expect(cookie).toContain('Path=/');
  expect(cookie.includes('Secure')).toBe(secure);
}

describe('hostToken cookie options', () => {
  const originalRegistrationEnabled = process.env.REGISTRATION_ENABLED;

  beforeAll(async () => {
    process.env.REGISTRATION_ENABLED = 'true';
    await prisma.hostUser.create({
      data: { email: testEmail, passwordHash: await bcrypt.hash(testPassword, 10) },
    });
  });

  afterAll(async () => {
    for (const email of [testEmail, registerEmail]) {
      const user = await prisma.hostUser.findUnique({ where: { email } });
      if (user) {
        await prisma.legalAcceptance.deleteMany({ where: { hostUserId: user.id } });
        await prisma.session.deleteMany({ where: { userId: user.id } });
        await prisma.hostUser.delete({ where: { id: user.id } });
      }
    }
    if (originalRegistrationEnabled === undefined) delete process.env.REGISTRATION_ENABLED;
    else process.env.REGISTRATION_ENABLED = originalRegistrationEnabled;
    await prisma.$disconnect();
  });

  it('uses secure cookie options consistently for login, registration, logout, and clear-session', async () => {
    config.cookieSecure = loadConfig({ COOKIE_SECURE: 'true' }).cookieSecure;

    const login = await request(app).post('/auth/login').send({ email: testEmail, password: testPassword }).expect(200);
    const register = await request(app).post('/auth/register').send({
      email: registerEmail,
      password: testPassword,
      termsAccepted: true,
      displayedTermsVersion: legalBackendConfig.versions[LegalDocumentType.TERMS],
      personalDataConsentAccepted: true,
      displayedPersonalDataConsentVersion: '1.0',
    }).expect(200);
    const logout = await request(app).post('/auth/logout').set('Cookie', hostCookie(login)).expect(200);
    const clearSession = await request(app).post('/auth/clear-session').expect(200);

    for (const response of [login, register, logout, clearSession]) {
      expectCookieOptions(hostCookie(response), true);
    }
  });

  it('allows local HTTP cookies when COOKIE_SECURE is false', async () => {
    config.cookieSecure = loadConfig({ COOKIE_SECURE: 'false' }).cookieSecure;

    const login = await request(app).post('/auth/login').send({ email: testEmail, password: testPassword }).expect(200);
    expectCookieOptions(hostCookie(login), false);
  });
});
