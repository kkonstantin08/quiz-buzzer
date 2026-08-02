import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const wrapper = path.resolve(process.cwd(), 'scripts/compose.sh');
const backupScript = fs.readFileSync(path.resolve(process.cwd(), 'scripts/backup.sh'), 'utf8');
const restoreScript = fs.readFileSync(path.resolve(process.cwd(), 'scripts/restore.sh'), 'utf8');
const roots: string[] = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-buzzer-compose-v2-'));
  roots.push(root);
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'docker.log');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/sh
if [ "$*" = "compose version --short" ]; then
  echo "\${FAKE_COMPOSE_VERSION:-v2.40.3}"
  exit 0
fi
printf '%s\\n' "$*" >> "$DOCKER_LOG"
`);
  fs.chmodSync(path.join(bin, 'docker'), 0o755);
  return { bin, log };
}

function run(version: string, project?: string) {
  const { bin, log } = fixture();
  execFileSync('sh', [wrapper, 'ps'], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      DOCKER_LOG: log,
      FAKE_COMPOSE_VERSION: version,
      ...(project ? { COMPOSE_PROJECT_NAME: project } : {}),
    },
    stdio: 'pipe',
  });
  return fs.readFileSync(log, 'utf8');
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Compose v2 operator guard', () => {
  it('rejects Compose v1 before running a project command', () => {
    expect(() => run('1.29.2')).toThrow();
  });

  it('uses Compose v2 with the production project name by default', () => {
    expect(run('v2.40.3')).toBe('compose --project-name quiz-buzzer ps\n');
  });

  it('allows an explicit isolated project name', () => {
    expect(run('2.40.3', 'quiz-buzzer-test')).toBe('compose --project-name quiz-buzzer-test ps\n');
  });

  it('routes host backup and restore operations through the guard', () => {
    expect(backupScript).toContain('compose.sh');
    expect(restoreScript).toContain('compose.sh');
    expect(backupScript).not.toContain('docker compose');
    expect(restoreScript).not.toContain('docker compose');
  });
});
