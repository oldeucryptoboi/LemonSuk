#!/usr/bin/env sh

set -eu

repo_root="${LOCAL_ENV_ROOT:-$(pwd)}"

set -a
for env_file in \
  "$repo_root/.env" \
  "$repo_root/.env.local" \
  "$repo_root/.env.development" \
  "$repo_root/.env.development.local"
do
  if [ -f "$env_file" ]; then
    . "$env_file"
  fi
done
set +a
