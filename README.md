# redner

`redner` is a small, single-user deployment dashboard built to learn how platforms
such as Render and Railway work internally.

Give redner a trusted public GitHub repository that contains a `Dockerfile`. It
clones the repository, builds an image, starts a container, streams deployment
logs, and exposes the application through a local subdomain.

> [!WARNING]
> redner runs repository code and controls Docker. It has no user authentication
> and must not be exposed as a public dashboard. Only deploy repositories you
> trust, and run it locally, on a private network, or behind server-level access
> protection.

## Project Status

The local learning MVP is complete. Phases 0 through 9 are implemented: the npm
workspace foundation, local infrastructure, Prisma data model, project API,
Next.js dashboard, BullMQ queue, deployment worker, safe repository cloning, and
Docker image builds are in place.
Candidate containers, health checks, Caddy promotion, stop, and restart are also
implemented. Deployment logs are stored, streamed live with SSE, and displayed in
the dashboard. Stable `.localhost` application routing is verified through Caddy.
Active builds can be cancelled without taking the current version offline. Worker
startup reconciliation restores runtime state and removes abandoned resources.
Stopped projects can be deleted cleanly, including their Caddy route, Docker
container, Docker image, and database history.

- [Project plan](./REDNER_PROJECT_PLAN.md)
- [Phase checklist](./REDNER_PHASE_CHECKLIST.md)
- [Single-VPS deployment](./DEPLOYMENT.md)

## MVP

The learning MVP will support this flow:

1. Create a project from a trusted public GitHub repository.
2. Choose its branch, slug, and container port.
3. Queue a deployment from the dashboard.
4. Clone the repository and build its `Dockerfile`.
5. Watch stored and live build logs.
6. Start the new container and verify that it is healthy.
7. Route a local subdomain to it through Caddy.
8. Cancel an active build without stopping the running version.
9. Stop, restart, redeploy, or delete the application.

The first target is one developer machine. The repository also includes the
single-VPS deployment files used for the public learning instance, but the
dashboard still needs server-level protection before it should be exposed beyond
a controlled environment.

## Architecture

```text
Browser
  |-- application API and stored state --> Fastify API --> PostgreSQL
  |-- live deployment logs -------------> SSE endpoint
                                             ^
                                             | Redis Pub/Sub
Fastify API --> BullMQ/Redis --> Deployment worker --> Git and Docker
                                                         |
Internet or local browser --> Caddy ------------------> App containers
```

## Local Infrastructure

Docker Desktop or another Docker Engine with Compose is required. The checked-in
defaults are suitable for local learning; copy `.env.example` to `.env` only when
you need to override them.

```bash
docker compose up -d --wait
docker compose ps
curl http://localhost/healthz
```

The health endpoint should return `ok`. Stop the services without deleting their
persistent PostgreSQL and Caddy volumes:

```bash
docker compose down
```

Apply tracked database migrations and start the API:

```bash
npm run db:deploy
npm run dev:api
curl http://127.0.0.1:4000/health
```

The API reports `200` when PostgreSQL and Redis are available and `503` when
either dependency is down.

Start the API and dashboard together:

```bash
npm run dev
```

Open `http://localhost:3000` to create and manage project configurations. Local
application hostnames continue to use `.localhost`; a personal base domain is
configured only during the optional single-VPS phase.

After a successful deployment, open `http://project-slug.localhost` from its
project page. Modern browsers resolve `.localhost` automatically. If an
environment does not, add each project hostname explicitly to `/etc/hosts`:

```text
127.0.0.1 project-slug.localhost
```

Application containers do not publish random host ports. Caddy is the only HTTP
entry point and forwards each validated hostname over the shared Docker network.

Deployment output is available through the dashboard or these API endpoints:

```text
GET /deployments/:id/logs?after=0&limit=200
GET /deployments/:id/logs/stream
```

The stream sends stored backlog first, then Redis-backed live events with SSE IDs
and heartbeat comments so browsers can reconnect without duplicating lines.

## Technology

| Area | Choice | Learning purpose |
| --- | --- | --- |
| Frontend | Next.js, TypeScript, Tailwind CSS | Build a small deployment dashboard |
| API | Fastify and TypeScript | Validate requests and manage project state |
| Database | PostgreSQL and Prisma | Persist projects, deployments, and logs |
| Queue | Redis and BullMQ | Move slow deployments out of API requests |
| Runtime | Docker | Build images and run isolated application processes |
| Routing | Caddy | Route subdomains with simple, reloadable configuration |
| Live logs | Server-Sent Events | Stream one-way log updates to the browser |

## Learning Goals

- Understand Docker images, containers, networks, and health checks.
- Build an asynchronous deployment pipeline.
- Safely execute Git and Docker commands from a worker.
- Persist deployment state and recover it after process restarts.
- Stream live logs without losing stored history.
- Generate reverse-proxy routes and reload them without downtime.
- Learn the basic DNS and TLS setup used by deployment platforms.

## Deliberate Limits

To keep the project useful and finishable, the MVP does not include:

- Accounts, teams, billing, or public access
- Private repositories or Git provider OAuth
- Automatic deploys and pull-request previews
- Environment-variable and secret management
- Rollbacks, scaling, Kubernetes, or multiple servers
- Managed databases, advanced metrics, or Compose imports

These are product features rather than requirements for learning the core
deployment path.

## Safety Boundaries

- Deploy only repositories you own or have reviewed.
- Invoke commands with argument arrays and `shell: false`.
- Validate repository URLs, branches, slugs, and ports before queuing work.
- Never mount host secrets or the Docker socket into deployed applications.
- Apply CPU, memory, and process limits to application containers.
- Keep the API and dashboard private; only deployed applications should be public.
- Use a disposable machine or VPS when experimenting with unfamiliar builds.

## Documentation

Read [REDNER_PROJECT_PLAN.md](./REDNER_PROJECT_PLAN.md) for the design, data
model, API, and deployment lifecycle. Use
[REDNER_PHASE_CHECKLIST.md](./REDNER_PHASE_CHECKLIST.md) as the implementation
tracker.
