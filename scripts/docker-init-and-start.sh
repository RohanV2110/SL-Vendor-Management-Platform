#!/bin/sh
set -eu

: "${DB_HOST:=postgres}"
: "${DB_PORT:=5432}"
: "${DB_USER:=postgres}"
: "${DB_PASSWORD:=postgres}"
: "${DB_NAME:=sugarleather_vms}"
: "${DB_SCHEMA:=public}"
: "${POSTGRES_ADMIN_DB:=postgres}"

case "$DB_NAME" in
  ""|*[!a-zA-Z0-9_]*)
    echo "DB_NAME must contain only letters, numbers, and underscores." >&2
    exit 1
    ;;
esac

case "$DB_SCHEMA" in
  ""|*[!a-zA-Z0-9_]*)
    echo "DB_SCHEMA must contain only letters, numbers, and underscores." >&2
    exit 1
    ;;
esac

if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=${DB_SCHEMA}"
fi

export PGPASSWORD="$DB_PASSWORD"

echo "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$POSTGRES_ADMIN_DB" >/dev/null 2>&1; do
  sleep 2
done

if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$POSTGRES_ADMIN_DB" -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  echo "Creating PostgreSQL database ${DB_NAME}..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$POSTGRES_ADMIN_DB" -c "CREATE DATABASE \"$DB_NAME\""
fi

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE SCHEMA IF NOT EXISTS \"$DB_SCHEMA\""

echo "Applying Prisma schema to ${DB_NAME}.${DB_SCHEMA}..."
npx prisma db push

exec npm run start
