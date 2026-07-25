#!/bin/sh
set -eu

backup_dir=${BACKUP_DIR:-./backups}
retention=${BACKUP_RETENTION_COUNT:-14}
version=$(git rev-parse --short HEAD 2>/dev/null || printf unknown)

mkdir -p "$backup_dir"
BACKUP_DIR="$backup_dir" BACKUP_RETENTION_COUNT="$retention" \
  docker compose --profile maintenance run --rm --no-deps \
    -e "APP_VERSION=$version" -e "BACKUP_RETENTION_COUNT=$retention" \
    backup /scripts/backup-container.sh create backup
