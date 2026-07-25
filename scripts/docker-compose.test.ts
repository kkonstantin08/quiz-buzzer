import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const composeFile = fs.readFileSync(path.resolve(process.cwd(), 'docker-compose.yml'), 'utf8');

const dockerAvailable = (() => {
  try {
    execFileSync('docker', ['compose', 'version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('docker compose', () => {
  it('uses Node fetch for the backend healthcheck', () => {
    expect(composeFile).toContain("fetch('http://localhost:3001/api/health')");
  });

  it.skipIf(!dockerAvailable)('uses NGINX_PORT for the nginx host port', () => {
    const config = JSON.parse(execFileSync('docker', ['compose', '--profile', 'tunnel', 'config', '--format', 'json'], {
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
    expect(config.services.nginx.networks.proxy_network.ipv4_address).toBe('172.30.0.10');
    expect(config.services.cloudflared.networks.proxy_network.ipv4_address).toBe('172.30.0.11');
    expect(config.services.backend.environment.UPLOAD_DIR).toBe('/app/uploads');
  });
});
