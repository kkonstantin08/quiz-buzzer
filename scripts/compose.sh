#!/bin/sh
set -eu

version=$(docker compose version --short 2>/dev/null) || {
  echo "Docker Compose v2 is required; install the official CLI plugin." >&2
  exit 1
}

case "$version" in
  v2.*|2.*) ;;
  *)
    echo "Docker Compose v2 is required; found $version." >&2
    exit 1
    ;;
esac

exec docker compose --project-name "${COMPOSE_PROJECT_NAME:-quiz-buzzer}" "$@"
