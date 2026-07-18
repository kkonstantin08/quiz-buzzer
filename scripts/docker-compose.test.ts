import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const dockerAvailable = (() => {
  try {
    execFileSync('docker', ['compose', 'version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('docker compose', () => {
  it.skipIf(!dockerAvailable)('uses NGINX_PORT for the nginx host port', () => {
    const config = JSON.parse(execFileSync('docker', ['compose', 'config', '--format', 'json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        COMPOSE_PROJECT_NAME: 'quiz-buzzer-test',
        JWT_SECRET: 'ci-test-jwt-secret-at-least-32-characters',
        NGINX_PORT: '8080',
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    }));

    expect(config.services.nginx.ports).toContainEqual(expect.objectContaining({
      published: '8080',
      target: 80,
    }));
  });
});
