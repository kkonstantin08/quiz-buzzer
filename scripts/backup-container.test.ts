import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = path.resolve(process.cwd(), 'scripts/backup-container.sh');
const roots: string[] = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-buzzer-backup-'));
  roots.push(root);
  const data = path.join(root, 'data');
  const uploads = path.join(root, 'uploads');
  const backups = path.join(root, 'backups');
  fs.mkdirSync(data);
  fs.mkdirSync(uploads);
  fs.mkdirSync(backups);
  execFileSync('sqlite3', [path.join(data, 'dev.db'), 'CREATE TABLE items (name TEXT); INSERT INTO items VALUES (\'saved\');']);
  fs.writeFileSync(path.join(uploads, 'avatar.png'), 'image-data');
  return { root, data, uploads, backups };
}

function run(action: string, paths: ReturnType<typeof fixture>, env: NodeJS.ProcessEnv = {}) {
  return execFileSync('sh', [script, action], {
    encoding: 'utf8',
    env: {
      ...process.env,
      APP_VERSION: 'test-sha',
      BACKUP_DATA_DIR: paths.data,
      BACKUP_UPLOAD_DIR: paths.uploads,
      BACKUP_DIR: paths.backups,
      ...env,
    },
  });
}

function archive(paths: ReturnType<typeof fixture>) {
  const entries = fs.readdirSync(paths.backups).filter((name) => name.endsWith('.tar.gz'));
  expect(entries).toHaveLength(1);
  return path.join(paths.backups, entries[0]);
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('backup-container.sh', () => {
  it('creates a verified archive with SQLite, uploads, metadata, and checksum', () => {
    const paths = fixture();
    run('create', paths);
    const result = archive(paths);

    expect(fs.statSync(result).size).toBeGreaterThan(0);
    expect(fs.existsSync(`${result}.sha256`)).toBe(true);
    const files = execFileSync('tar', ['-tzf', result], { encoding: 'utf8' });
    expect(files).toContain('database.sqlite');
    expect(files).toContain('uploads/avatar.png');
    expect(files).toContain('metadata.json');
    expect(run('verify', paths, { BACKUP_ARCHIVE: result })).toContain('verified');
  });

  it('fails verification when SQLite integrity_check is not ok', () => {
    const paths = fixture();
    run('create', paths);
    const fakeSqlite = path.join(paths.root, 'sqlite3-bad-integrity');
    fs.writeFileSync(fakeSqlite, '#!/bin/sh\ncase "$2" in *integrity_check*) echo corrupt ;; *) exec sqlite3 "$@" ;; esac\n');
    fs.chmodSync(fakeSqlite, 0o755);

    expect(() => run('verify', paths, { BACKUP_ARCHIVE: archive(paths), SQLITE3_BIN: fakeSqlite })).toThrow();
  });

  it('rotates only older successful backup archives', () => {
    const paths = fixture();
    run('create', paths, { BACKUP_RETENTION_COUNT: '2' });
    run('create', paths, { BACKUP_RETENTION_COUNT: '2' });
    run('create', paths, { BACKUP_RETENTION_COUNT: '2' });

    expect(fs.readdirSync(paths.backups).filter((name) => name.endsWith('.tar.gz'))).toHaveLength(2);
    expect(fs.readdirSync(paths.backups).filter((name) => name.endsWith('.tar.gz.sha256'))).toHaveLength(2);
  });

  it('fails for a missing archive and a damaged checksum', () => {
    const paths = fixture();
    expect(() => run('verify', paths, { BACKUP_ARCHIVE: path.join(paths.backups, 'missing.tar.gz') })).toThrow();

    run('create', paths);
    const result = archive(paths);
    fs.writeFileSync(`${result}.sha256`, 'bad checksum\n');
    expect(() => run('verify', paths, { BACKUP_ARCHIVE: result })).toThrow();
  });

  it('does not restore data when the backup is invalid', () => {
    const paths = fixture();
    run('create', paths);
    const result = archive(paths);
    fs.writeFileSync(`${result}.sha256`, 'bad checksum\n');
    fs.writeFileSync(path.join(paths.uploads, 'current.txt'), 'keep-me');

    expect(() => run('restore', paths, { BACKUP_ARCHIVE: result })).toThrow();
    expect(execFileSync('sqlite3', [path.join(paths.data, 'dev.db'), 'SELECT name FROM items;'], { encoding: 'utf8' }).trim()).toBe('saved');
    expect(fs.readFileSync(path.join(paths.uploads, 'current.txt'), 'utf8')).toBe('keep-me');
  });
});
