#!/bin/sh
set -eu

usage() {
  echo "Usage: $0 <backup-archive.tar.gz> [--yes]" >&2
  exit 2
}

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || usage
archive_input=$1
auto_confirm=${2:-}
[ -z "$auto_confirm" ] || [ "$auto_confirm" = --yes ] || usage
backup_dir=${BACKUP_DIR:-./backups}
[ -d "$backup_dir" ] || { echo "Backup directory does not exist: $backup_dir" >&2; exit 1; }
backup_dir=$(cd "$backup_dir" && pwd -P)
archive_dir=$(cd "$(dirname "$archive_input")" && pwd -P) || { echo "Archive directory does not exist" >&2; exit 1; }
archive="$archive_dir/$(basename "$archive_input")"

case "$archive" in
  "$backup_dir"/*.tar.gz) archive_in_container="/backups/${archive#"$backup_dir"/}" ;;
  *) echo "Archive must be inside BACKUP_DIR: $backup_dir" >&2; exit 1 ;;
esac

if [ "$auto_confirm" != --yes ]; then
  printf 'This stops backend and replaces its database and uploads. Type RESTORE to continue: '
  read -r confirmation
  [ "$confirmation" = RESTORE ] || { echo "Restore cancelled."; exit 1; }
fi

compose_restore() {
  BACKUP_DIR="$backup_dir" docker compose --profile maintenance run --rm --no-deps \
    -e "BACKUP_ARCHIVE=$archive_in_container" restore "$@"
}

compose_backup() {
  BACKUP_DIR="$backup_dir" docker compose --profile maintenance run --rm --no-deps backup "$@"
}

echo "Validating backup before stopping backend..."
if ! compose_restore /scripts/backup-container.sh verify; then
  echo "Restore aborted: backup validation failed; backend was not stopped." >&2
  exit 1
fi

stopped=0
emergency_path=""
on_exit() {
  status=$?
  trap - EXIT
  if [ "$stopped" -eq 1 ]; then docker compose up -d backend || true; fi
  if [ "$status" -ne 0 ]; then
    echo "Restore failed. Emergency backup is retained in $backup_dir." >&2
    [ -z "$emergency_path" ] || echo "Emergency backup: $emergency_path" >&2
    echo "Inspect the backup, then restore the emergency archive with this script if needed." >&2
  fi
  exit "$status"
}
trap on_exit EXIT

docker compose stop backend
stopped=1
if emergency_output=$(compose_backup /scripts/backup-container.sh create emergency); then
  printf '%s\n' "$emergency_output"
  emergency_container_path=$(printf '%s\n' "$emergency_output" | sed -n 's/^BACKUP_PATH=//p')
  case "$emergency_container_path" in
    /backups/*) emergency_path="$backup_dir/${emergency_container_path#/backups/}" ;;
    *) echo "Warning: emergency backup path could not be mapped to BACKUP_DIR." >&2 ;;
  esac
else
  echo "Warning: emergency backup could not be created; continuing with the validated target backup." >&2
fi
compose_restore /scripts/backup-container.sh restore
docker compose up -d backend
stopped=0
healthy=0
attempt=1
while [ "$attempt" -le 30 ]; do
  health=$(docker compose exec -T backend node -e 'fetch("http://localhost:3001/api/health").then(async (response) => { if (!response.ok) process.exit(1); process.stdout.write(await response.text()); }).catch(() => process.exit(1))' 2>/dev/null || true)
  if printf '%s' "$health" | grep -q '"status":"ok"' && printf '%s' "$health" | grep -q '"database":"connected"'; then
    healthy=1
    break
  fi
  [ "$attempt" -eq 30 ] || sleep 2
  attempt=$((attempt + 1))
done
[ "$healthy" -eq 1 ] || {
  echo "Backend did not become healthy after restore." >&2
  docker compose ps >&2 || true
  docker compose logs backend >&2 || true
  exit 1
}
echo "Restore completed. Emergency backup retained: $emergency_path"
