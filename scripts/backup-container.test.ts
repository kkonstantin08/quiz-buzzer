import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = path.resolve(process.cwd(), 'scripts/backup-container.sh');
const restoreScript = path.resolve(process.cwd(), 'scripts/restore.sh');
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

function runHostRestore(paths: ReturnType<typeof fixture>, result: string, env: NodeJS.ProcessEnv = {}) {
  const bin = path.join(paths.root, 'bin');
  const log = path.join(paths.root, 'docker.log');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'sleep'), '#!/bin/sh\nexit 0\n');
  fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/sh
printf '%s\\n' "$*" >> "$DOCKER_LOG"
case "$*" in
  *" backup /scripts/backup-container.sh create emergency")
    if [ "\${EMERGENCY_FAIL:-}" = 1 ]; then echo "emergency unavailable" >&2; exit 1; fi
    output=$(BACKUP_DATA_DIR="$BACKUP_DATA_DIR" BACKUP_UPLOAD_DIR="$BACKUP_UPLOAD_DIR" BACKUP_DIR="$BACKUP_DIR" sh "$BACKUP_CONTAINER_SCRIPT" create emergency) || exit $?
    printf '%s\\n' "$output" | sed "s#BACKUP_PATH=$BACKUP_DIR/#BACKUP_PATH=/backups/#"
    ;;
  *" restore /scripts/backup-container.sh verify"|*" restore /scripts/backup-container.sh restore")
    archive=""
    for arg in "$@"; do case "$arg" in BACKUP_ARCHIVE=/backups/*) archive="\${arg#BACKUP_ARCHIVE=/backups/}" ;; esac; done
    action=verify
    case "$*" in *" /scripts/backup-container.sh restore") action=restore ;; esac
    BACKUP_ARCHIVE="$BACKUP_DIR/$archive" BACKUP_DATA_DIR="$BACKUP_DATA_DIR" BACKUP_UPLOAD_DIR="$BACKUP_UPLOAD_DIR" BACKUP_DIR="$BACKUP_DIR" sh "$BACKUP_CONTAINER_SCRIPT" "$action"
    ;;
  *" exec "*)
    count=0; [ -f "$HEALTH_COUNT" ] && count=$(cat "$HEALTH_COUNT"); count=$((count + 1)); echo "$count" > "$HEALTH_COUNT"
    if [ "$count" -eq 1 ] && [ "\${HEALTH_RETRY:-}" = 1 ]; then echo '{"status":"ok"}'; else echo '{"status":"ok","database":"connected"}'; fi
    ;;
esac
`);
  fs.chmodSync(path.join(bin, 'sleep'), 0o755);
  fs.chmodSync(path.join(bin, 'docker'), 0o755);

  return execFileSync('sh', [restoreScript, result, '--yes'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      PATH: `${bin}:${process.env.PATH}`,
      BACKUP_DIR: paths.backups,
      BACKUP_DATA_DIR: paths.data,
      BACKUP_UPLOAD_DIR: paths.uploads,
      BACKUP_CONTAINER_SCRIPT: script,
      DOCKER_LOG: log,
      HEALTH_COUNT: path.join(paths.root, 'health-count'),
    },
  });
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

  it('restores a valid backup when the current database is missing', () => {
    const paths = fixture();
    run('create', paths);
    const result = archive(paths);
    fs.rmSync(path.join(paths.data, 'dev.db'));

    run('restore', paths, { BACKUP_ARCHIVE: result });
    expect(execFileSync('sqlite3', [path.join(paths.data, 'dev.db'), 'SELECT name FROM items;'], { encoding: 'utf8' }).trim()).toBe('saved');
  });

  it('restores uploads into an empty directory', () => {
    const paths = fixture();
    run('create', paths);
    const result = archive(paths);
    fs.rmSync(paths.uploads, { recursive: true, force: true });
    fs.mkdirSync(paths.uploads);

    run('restore', paths, { BACKUP_ARCHIVE: result });
    expect(fs.readFileSync(path.join(paths.uploads, 'avatar.png'), 'utf8')).toBe('image-data');
  });

  it('continues a valid restore when the emergency backup cannot be created', () => {
    const paths = fixture();
    run('create', paths);
    const result = archive(paths);
    fs.rmSync(path.join(paths.data, 'dev.db'));

    runHostRestore(paths, result);
    expect(execFileSync('sqlite3', [path.join(paths.data, 'dev.db'), 'SELECT name FROM items;'], { encoding: 'utf8' }).trim()).toBe('saved');
  });

  it('waits for a connected health response and reports a host-side emergency path', () => {
    const paths = fixture();
    run('create', paths);
    const result = archive(paths);

    const output = runHostRestore(paths, result, { HEALTH_RETRY: '1' });
    expect(output).toContain(`Emergency backup retained: ${fs.realpathSync(paths.backups)}/quiz-buzzer-emergency-`);
    expect(Number(fs.readFileSync(path.join(paths.root, 'health-count'), 'utf8'))).toBe(2);
    expect(fs.readFileSync(path.join(paths.root, 'docker.log'), 'utf8')).toContain('exec -T backend node -e');
  });
});
