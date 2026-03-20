#!/usr/bin/env bash

set -euo pipefail

. ./scripts/load-local-env.sh

api_pid=""
api_health_url="${LOCAL_API_HEALTH_URL:-http://localhost:8787/api/v1/dashboard}"
api_wait_attempts="${LOCAL_API_WAIT_ATTEMPTS:-30}"
api_wait_delay_seconds="${LOCAL_API_WAIT_DELAY_SECONDS:-1}"

cleanup() {
  if [[ -n "${api_pid}" ]]; then
    kill "${api_pid}" 2>/dev/null || true
    wait "${api_pid}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

npm run dev:api &
api_pid=$!

api_ready="false"

for ((attempt = 1; attempt <= api_wait_attempts; attempt += 1)); do
  if curl --silent --fail --output /dev/null "${api_health_url}"; then
    api_ready="true"
    break
  fi

  if ! kill -0 "${api_pid}" 2>/dev/null; then
    echo "Local API exited before becoming healthy." >&2
    wait "${api_pid}"
  fi

  sleep "${api_wait_delay_seconds}"
done

if [[ "${api_ready}" != "true" ]]; then
  echo "Timed out waiting for local API at ${api_health_url}." >&2
  exit 1
fi

npm run dev:web
