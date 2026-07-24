#!/bin/sh
set -eu

DATA_DIR=${BACKUP_DATA_DIR:-/data}
UPLOAD_DIR=${BACKUP_UPLOAD_DIR:-/uploads}
BACKUP_DIR=${BACKUP_DIR:-/backups}
SQLITE3_BIN=${SQLITE3_BIN:-sqlite3}

die() {
  echo "Backup error: $*" >&2
  exit 1
}

require_sqlite() {
  command -v "$SQLITE3_BIN" >/dev/null 2>&1 || die "sqlite3 is unavailable"
}

require_backup_inputs() {
  mkdir -p "$UPLOAD_DIR"
  [ -f "$DATA_DIR/dev.db" ] || die "SQLite database is missing: $DATA_DIR/dev.db"
  require_sqlite
}

require_restore_inputs() {
  mkdir -p "$DATA_DIR" "$UPLOAD_DIR"
  require_sqlite
}

verify_archive() (
  archive=$1
  [ -f "$archive" ] && [ -s "$archive" ] || die "archive is missing or empty: $archive"
  [ -f "$archive.sha256" ] || die "checksum is missing: $archive.sha256"
  expected_checksum=$(awk 'NR == 1 { print $1; exit }' "$archive.sha256")
  printf '%s' "$expected_checksum" | grep -Eq '^[0-9a-f]{64}$' || die "checksum is malformed: $archive.sha256"
  actual_checksum=$(sha256sum "$archive" | awk '{ print $1 }')
  [ "$actual_checksum" = "$expected_checksum" ] || die "checksum verification failed: $archive"

  entries=$(tar -tzf "$archive") || die "archive cannot be listed: $archive"
  [ -n "$entries" ] || die "archive is empty: $archive"
  printf '%s\n' "$entries" | while IFS= read -r entry; do
    case "$entry" in
      metadata.json|database.sqlite|uploads/|uploads/*) ;;
      *) die "archive contains an unexpected path: $entry" ;;
    esac
  done

  verify_dir=$(mktemp -d)
  trap 'rm -rf "$verify_dir"' EXIT
  tar -xzf "$archive" -C "$verify_dir" || die "archive cannot be extracted: $archive"
  [ -f "$verify_dir/database.sqlite" ] || die "archive has no SQLite database"
  [ -f "$verify_dir/metadata.json" ] || die "archive has no metadata"
  [ -d "$verify_dir/uploads" ] || die "archive has no uploads directory"
  [ "$("$SQLITE3_BIN" "$verify_dir/database.sqlite" 'PRAGMA integrity_check;')" = "ok" ] || die "SQLite integrity_check did not return ok"
)

rotate_backups() {
  retention=${BACKUP_RETENTION_COUNT:-14}
  case "$retention" in ''|*[!0-9]*) die "BACKUP_RETENTION_COUNT must be a positive integer" ;; esac
  [ "$retention" -gt 0 ] || die "BACKUP_RETENTION_COUNT must be greater than zero"

  set -- "$BACKUP_DIR"/quiz-buzzer-backup-*.tar.gz
  [ -e "$1" ] || return 0
  count=$#
  while [ "$count" -gt "$retention" ]; do
    oldest=$1
    rm -f "$oldest" "$oldest.sha256"
    shift
    count=$((count - 1))
  done
}

create_backup() (
  tag=${1:-backup}
  case "$tag" in ''|*[!A-Za-z0-9_-]*) die "backup tag contains unsafe characters" ;; esac
  require_backup_inputs
  mkdir -p "$BACKUP_DIR"
  stage=$(mktemp -d "$BACKUP_DIR/.backup.XXXXXX")
  trap 'rm -rf "$stage"' EXIT
  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  archive_name="quiz-buzzer-$tag-$timestamp-$$.tar.gz"
  archive="$BACKUP_DIR/$archive_name"

  "$SQLITE3_BIN" "$DATA_DIR/dev.db" ".backup '$stage/database.sqlite'" || die "SQLite .backup failed"
  mkdir -p "$stage/uploads"
  tar -C "$UPLOAD_DIR" -cf - . | tar -C "$stage/uploads" -xf -
  node -e 'console.log(JSON.stringify({ createdAt: process.argv[1], appVersion: process.argv[2], format: 1 }, null, 2))' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${APP_VERSION:-unknown}" > "$stage/metadata.json"
  tar -C "$stage" -czf "$stage/$archive_name" database.sqlite uploads metadata.json
  checksum=$(sha256sum "$stage/$archive_name" | awk '{ print $1 }')
  printf '%s  %s\n' "$checksum" "$archive_name" > "$stage/$archive_name.sha256"
  verify_archive "$stage/$archive_name"
  mv "$stage/$archive_name" "$archive"
  mv "$stage/$archive_name.sha256" "$archive.sha256"
  [ "$tag" = backup ] && rotate_backups
  echo "BACKUP_PATH=$archive"
)

restore_backup() (
  archive=${BACKUP_ARCHIVE:?BACKUP_ARCHIVE is required}
  require_restore_inputs
  verify_archive "$archive"
  stage=$(mktemp -d "$DATA_DIR/.restore.XXXXXX")
  trap 'rm -rf "$stage"' EXIT
  tar -xzf "$archive" -C "$stage"
  cp "$stage/database.sqlite" "$DATA_DIR/.restore-db-$$"
  rm -f "$DATA_DIR/dev.db-wal" "$DATA_DIR/dev.db-shm" "$DATA_DIR/dev.db-journal"
  mv "$DATA_DIR/.restore-db-$$" "$DATA_DIR/dev.db"
  find "$UPLOAD_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  tar -C "$stage/uploads" -cf - . | tar -C "$UPLOAD_DIR" -xf -
)

case "${1:-}" in
  create) create_backup "${2:-backup}" ;;
  verify) verify_archive "${BACKUP_ARCHIVE:?BACKUP_ARCHIVE is required}"; echo "Backup verified" ;;
  restore) restore_backup; echo "Backup restored" ;;
  *) echo "Usage: $0 {create [tag]|verify|restore}" >&2; exit 2 ;;
esac
