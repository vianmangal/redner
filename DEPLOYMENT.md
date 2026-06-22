# Single-VPS Deployment

This deployment keeps PostgreSQL, Redis, and Caddy in Docker while the web,
API, and worker processes run under systemd. It assumes Ubuntu 24.04, the
repository at `/home/ubuntu/redner`, and the `ubuntu` user in the Docker group.

## Domains

Use separate DNS names for the private dashboard and deployed applications:

```text
redner.example.com      dashboard and API
*.apps.example.com      deployed applications
```

Create `A` records for both names pointing to the VPS static IPv4 address.
Only create matching `AAAA` records when IPv6 is configured and firewalled.

## Environment

Copy `.env.example` to `.env`, generate a PostgreSQL password, and set:

```dotenv
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=4000
WEB_ORIGIN=https://redner.example.com
NEXT_PUBLIC_API_URL=https://redner.example.com/api
NEXT_PUBLIC_REDNER_BASE_DOMAIN=apps.example.com
REDNER_INTERNAL_API_URL=http://127.0.0.1:4000

POSTGRES_PASSWORD=replace-with-a-random-hex-value
DATABASE_URL=postgresql://redner:replace-with-a-random-hex-value@localhost:5432/redner
REDIS_URL=redis://localhost:6379

WORKER_CONCURRENCY=1
CONTAINER_MEMORY_LIMIT=256m
CONTAINER_CPU_LIMIT=0.5
REDNER_BASE_DOMAIN=apps.example.com

CADDY_BIND_ADDRESS=0.0.0.0
CADDYFILE_PATH=./Caddyfile.production
REDNER_DASHBOARD_DOMAIN=redner.example.com
REDNER_ADMIN_USER=admin
REDNER_ADMIN_PASSWORD_HASH='replace-with-caddy-bcrypt-hash'
```

Generate the database password with `openssl rand -hex 24`. Generate the Caddy
hash interactively with:

```bash
docker run --rm -it caddy:2-alpine caddy hash-password
```

Keep the hash single-quoted in `.env` so Compose preserves its dollar signs.
The `NEXT_PUBLIC_*` values are embedded during `npm run build`; rebuild after
changing them.

## Install

```bash
npm ci
docker compose up -d --wait
npm run db:deploy
npm run build

sudo cp deploy/systemd/redner-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now redner-api redner-web redner-worker
```

Inspect the services and proxy:

```bash
systemctl --no-pager --full status redner-api redner-web redner-worker
docker compose ps
curl http://127.0.0.1:4000/health
```

Caddy obtains and renews public certificates automatically after the DNS
records resolve to the VPS and ports 80 and 443 are reachable. The dashboard
must remain protected by Caddy authentication because redner does not provide
application-level user accounts.

## Update

```bash
git pull --ff-only
npm ci
npm run db:deploy
npm run build
sudo systemctl restart redner-api redner-web redner-worker
docker compose up -d --wait
```
