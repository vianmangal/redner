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

Phases 0 through 3 are complete: the npm workspace foundation, local
infrastructure, Prisma data model, project API, and Next.js dashboard are in
place. Deployment features have not been implemented yet.

- [Project plan](./REDNER_PROJECT_PLAN.md)
- [Phase checklist](./REDNER_PHASE_CHECKLIST.md)

## MVP

The learning MVP will support this flow:

1. Create a project from a trusted public GitHub repository.
2. Choose its branch, slug, and container port.
3. Queue a deployment from the dashboard.
4. Clone the repository and build its `Dockerfile`.
5. Watch stored and live build logs.
6. Start the new container and verify that it is healthy.
7. Route a local subdomain to it through Caddy.
8. Stop, restart, or redeploy the application.

The first target is one developer machine. Deploying redner to one private VPS
with wildcard DNS and HTTPS is an optional final exercise.

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
