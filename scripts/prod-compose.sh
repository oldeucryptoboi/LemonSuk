#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
base_env="$ROOT_DIR/.env"
secret_env="${LEMONSUK_SECRETS_FILE:-$ROOT_DIR/.env.secrets}"

if [[ ! -f "$base_env" ]]; then
  echo "Missing $base_env" >&2
  exit 1
fi

if [[ ! -f "$secret_env" ]]; then
  echo "Missing $secret_env. Run scripts/render-prod-secrets.sh first." >&2
  exit 1
fi

exec docker compose \
  --env-file "$base_env" \
  --env-file "$secret_env" \
  -f "$ROOT_DIR/docker-compose.prod.yml" \
  "$@"
