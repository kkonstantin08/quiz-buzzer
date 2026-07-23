import { loadConfig } from '../config';

describe('development CORS configuration', () => {
  it('allows the local Vite server on 127.0.0.1', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).corsOrigin).toContain('http://127.0.0.1:5173');
  });

  it('requires valid Resend password-reset configuration in production', () => {
    const env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'test-secret',
      RESEND_API_KEY: 're_test',
      MAIL_FROM: 'КвизПульт <noreply@qbuz.ru>',
      APP_PUBLIC_URL: 'https://qbuz.ru',
      PASSWORD_RESET_TOKEN_TTL_MINUTES: '30',
    };
    expect(loadConfig(env).passwordResetTokenTtlMinutes).toBe(30);
    expect(() => loadConfig({ ...env, MAIL_FROM: 'invalid' })).toThrow('MAIL_FROM');
    expect(() => loadConfig({ ...env, PASSWORD_RESET_TOKEN_TTL_MINUTES: '0' })).toThrow('PASSWORD_RESET_TOKEN_TTL_MINUTES');
  });
});
