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

This repository currently contains the project design and implementation
checklist. The application has not been implemented yet.

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
7. Route a local subdomain to it through Traefik.
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
Internet or local browser --> Traefik ----------------> App containers
```

## Technology

| Area | Choice | Learning purpose |
| --- | --- | --- |
| Frontend | Next.js, TypeScript, Tailwind CSS | Build a small deployment dashboard |
| API | Fastify and TypeScript | Validate requests and manage project state |
| Database | PostgreSQL and Prisma | Persist projects, deployments, and logs |
| Queue | Redis and BullMQ | Move slow deployments out of API requests |
| Runtime | Docker | Build images and run isolated application processes |
| Routing | Traefik | Route subdomains to the correct containers |
| Live logs | Server-Sent Events | Stream one-way log updates to the browser |

## Learning Goals

- Understand Docker images, containers, networks, and health checks.
- Build an asynchronous deployment pipeline.
- Safely execute Git and Docker commands from a worker.
- Persist deployment state and recover it after process restarts.
- Stream live logs without losing stored history.
- Route multiple applications through one reverse proxy.
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
