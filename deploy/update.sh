#!/usr/bin/env bash

set -Eeuo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

git pull --ff-only
npm ci

set -a
# shellcheck disable=SC1091
source .env
set +a

npm run db:deploy
npm run build
docker compose up -d --wait

sudo systemctl restart redner-api redner-web redner-worker

for service in redner-api redner-web redner-worker; do
  sudo systemctl is-active --quiet "$service"
done

curl --fail --silent http://127.0.0.1:4000/health >/dev/null

echo "redner updated to $(git rev-parse --short HEAD)"
