#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRET_ID="${LEMONSUK_AWS_SECRET_ID:-lemonsuk/prod/app-secrets}"
OUTPUT_FILE="${LEMONSUK_SECRETS_FILE:-$ROOT_DIR/.env.secrets}"

tmp_file="$(mktemp)"
cleanup() {
  rm -f "$tmp_file"
}
trap cleanup EXIT

SECRET_JSON="$(
aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" \
  --query 'SecretString' \
  --output text
)"

SECRET_JSON="$SECRET_JSON" python3 - "$tmp_file" <<'PY'
import json
import os
import re
import sys
from pathlib import Path

raw = os.environ.get("SECRET_JSON", "").strip()
if not raw:
    raise SystemExit("SecretString was empty.")

try:
    payload = json.loads(raw)
except json.JSONDecodeError as exc:
    raise SystemExit(f"SecretString was not valid JSON: {exc}") from exc

if not isinstance(payload, dict):
    raise SystemExit("SecretString must decode to a JSON object.")

lines: list[str] = []
for key, value in payload.items():
    if not isinstance(key, str) or not re.fullmatch(r"[A-Z0-9_]+", key):
        continue
    if value is None:
        continue
    rendered = str(value)
    if "\n" in rendered:
        raise SystemExit(
            f"Secret {key} contains a newline and cannot be rendered into .env format."
        )
    lines.append(f"{key}={rendered}")

Path(sys.argv[1]).write_text("\n".join(lines) + ("\n" if lines else ""))
PY

install -m 600 "$tmp_file" "$OUTPUT_FILE"
echo "Rendered secrets to $OUTPUT_FILE from $SECRET_ID"
