#!/bin/sh
set -e

# Ensure the directory for SQLite exists
mkdir -p /app/prisma

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Starting application..."
exec node dist/server.js
