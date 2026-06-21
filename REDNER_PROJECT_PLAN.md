# redner Project Plan

## 1. Purpose

`redner` is a minimal, single-user deployment dashboard for learning how a
platform-as-a-service works. It accepts a trusted public GitHub repository with a
`Dockerfile`, builds it in a background worker, starts it with Docker, shows its
logs, and routes a subdomain to it through Caddy.

The project is intentionally limited to one host and one operator. It is not a
multi-tenant hosting service.

> Because redner has no authentication and controls Docker, its dashboard must
> remain local, private, or protected at the server level. Only trusted
> repositories should be deployed.

## 2. MVP Success Criteria

The MVP is complete when one operator can:

1. Create a project with a name, slug, public GitHub URL, branch, and app port.
2. Start a deployment without blocking the API request.
3. Watch stored and live clone, build, and startup logs.
4. Keep the currently running version available while a replacement builds.
5. Promote a healthy replacement container and remove the previous container.
6. Open the application through `project-slug.localhost`.
7. Stop, restart, redeploy, and delete a project.
8. Restart redner without losing project or deployment history.

Deploying the same system to a private single VPS with wildcard DNS and HTTPS is
an optional final exercise, not part of the local MVP.

## 3. Scope

### Included

- Trusted public GitHub repositories
- Dockerfile-based builds
- Manual deployments
- One running container per project
- Background deployment jobs
- Persisted build and runtime logs
- Live log streaming with Server-Sent Events (SSE)
- Basic HTTP health checks
- Local Caddy subdomain routing
- Stop, restart, redeploy, and delete actions
- Deployment timeouts, resource limits, and cleanup

### Not Included

- Authentication, teams, billing, or untrusted public users
- Private repositories, GitHub OAuth, or automatic webhooks
- Environment-variable and secret management
- Rollbacks or pull-request preview environments
- Horizontal scaling, Kubernetes, or multiple deployment hosts
- Managed databases, persistent application volumes, or Docker Compose imports
- Advanced metrics, alerts, or log aggregation systems

## 4. Technology

| Component | Technology | Responsibility |
| --- | --- | --- |
| Web | Next.js, TypeScript, Tailwind CSS | Dashboard and live log viewer |
| API | Fastify, TypeScript | Validation, CRUD, actions, and SSE |
| Database | PostgreSQL, Prisma | Durable project, deployment, and log state |
| Queue | Redis, BullMQ | Deployment jobs and worker coordination |
| Worker | Node.js, TypeScript | Git, Docker build, lifecycle, and cleanup |
| Runtime | Docker | Application images and containers |
| Proxy | Caddy | Generated routes and automatic HTTPS |

Use npm workspaces so the web, API, worker, database package, and shared types can
live in one repository without requiring an additional monorepo tool.

## 5. Architecture

```text
                         +----------------+
Browser ---------------->| Next.js web UI |
                         +-------+--------+
                                 |
                     REST and SSE|
                                 v
                         +----------------+
                         |  Fastify API   |
                         +---+--------+---+
                             |        |
                        SQL  |        | BullMQ jobs
                             v        v
                       PostgreSQL   Redis
                                        |
                                        v
                              +-------------------+
                              | Deployment worker |
                              +---------+---------+
                                        |
                                   Git and Docker
                                        v
                                   App containers
                                        ^
                                        |
Browser or internet -------------> Caddy
```

The API writes durable records to PostgreSQL and independently enqueues work in
BullMQ. The worker publishes live log events through Redis; the API forwards
them to connected SSE clients. Caddy handles application traffic only and must
not expose the redner dashboard publicly.

## 6. Repository Structure

```text
redner/
|-- apps/
|   |-- web/                 # Next.js dashboard
|   |-- api/                 # Fastify REST and SSE API
|   `-- worker/              # BullMQ deployment worker
|-- packages/
|   |-- database/            # Prisma schema and client
|   `-- shared/              # Shared schemas, types, and constants
|-- Caddyfile                # Base proxy configuration and route imports
|-- docker-compose.yml       # PostgreSQL, Redis, and Caddy
|-- .env.example
|-- package.json
`-- README.md
```

## 7. State Model

Project runtime state and deployment progress are separate concerns.

### Project status

```text
idle | running | unhealthy | stopped
```

### Deployment status

```text
queued | cloning | building | starting | succeeded | failed
```

A successful deployment remains `succeeded` even if its container is later
stopped. The project status describes the current runtime state.

### Project

```text
id
name
slug                  unique, lowercase DNS-safe value
repoUrl
branch
appPort
status
activeDeploymentId    nullable reference to the promoted deployment
createdAt
updatedAt
```

### Deployment

```text
id
projectId
status
trigger                manual | restart
commitHash
imageName
containerId
failureReason
startedAt
finishedAt
createdAt
```

The repository URL, branch, app port, and slug used by a deployment must be
copied into an immutable configuration snapshot. Editing a project later must
not change the history of an earlier deployment.

### Log

```text
id
deploymentId
sequence               increasing within one deployment
type                   system | build | runtime
message
createdAt
```

Limit individual messages and retain only a configured number of lines per
deployment. PostgreSQL storage is sufficient for this learning project.

## 8. HTTP Interface

### System

```http
GET /health
```

Returns API, database, and Redis connectivity.

### Projects

```http
GET    /projects
POST   /projects
GET    /projects/:id
DELETE /projects/:id
```

Example create request:

```json
{
  "name": "Todo API",
  "slug": "todo-api",
  "repoUrl": "https://github.com/example/todo-api.git",
  "branch": "main",
  "appPort": 3000
}
```

Validation rules:

- `slug` matches `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`.
- `repoUrl` is an HTTPS URL on `github.com`, without credentials or query data.
- `branch` is non-empty, length-limited, and passed as a process argument.
- `appPort` is an integer from 1 through 65535.
- Project slugs are unique.

### Deployments and actions

```http
POST /projects/:id/deploy
GET  /projects/:id/deployments
POST /projects/:id/stop
POST /projects/:id/restart
```

Only one deployment for a project may be active at a time. A deploy request
creates the database record before adding the BullMQ job. Duplicate requests
while work is active return a conflict response.

### Logs

```http
GET /deployments/:id/logs
GET /deployments/:id/logs/stream
```

The first endpoint returns stored logs ordered by sequence. The second uses
`text/event-stream`, sends new lines after the stored backlog, emits heartbeat
comments, and supports browser reconnection with the SSE event ID.

## 9. Deployment Lifecycle

For each BullMQ job, the worker performs these steps:

1. Acquire a per-project deployment lock and mark the deployment `cloning`.
2. Create a unique temporary directory.
3. Clone the selected branch with a shallow clone and obtain the commit hash.
4. Confirm that a `Dockerfile` exists and mark the deployment `building`.
5. Build an image tagged with the project and deployment IDs.
6. Start a uniquely named candidate container with resource and process limits.
7. Connect the candidate to the proxy network and mark the deployment `starting`.
8. Wait for a bounded HTTP health check against the configured app port.
9. If healthy, atomically write its Caddy route fragment, validate the complete
   Caddyfile, and gracefully reload Caddy.
10. After the route reload succeeds, make it active and stop/remove the old container.
11. Mark the deployment `succeeded`, begin collecting runtime logs, and clean the
    temporary directory.
12. If any step fails, keep the old active container, mark the new deployment
    `failed`, remove its candidate resources, and store a readable reason.

Caddy uses one generated route fragment per project. The fragment points the
stable project hostname at the active container name and port. A new fragment is
written through a temporary file and renamed only after it is complete. Validate
the assembled Caddyfile before reloading; if validation or reload fails, preserve
the previous fragment and keep routing to the old container. Caddy reloads its
configuration gracefully, so successful route changes do not restart the proxy.

Jobs must be idempotent: retrying a job must reuse its deployment record, remove
stale candidate resources with the same deployment ID, and never create two
active containers for the project.

## 10. Process Execution and Safety

Git and Docker commands must be started with an argument array and `shell: false`.
No request value may be interpolated into a shell command string.

Minimum application container controls:

```text
memory limit
CPU limit
PID limit
capabilities dropped where compatible
no-new-privileges
no Docker socket mount
no sensitive host mounts
restart policy disabled for candidate containers
```

The deployment worker requires Docker access and is therefore trusted. The API
and web application should not receive the Docker socket. Builds and containers
are not a secure sandbox for hostile code, so only reviewed repositories are in
scope.

Every clone, build, startup, and health-check stage needs a timeout. The worker
must cap captured output so a noisy process cannot exhaust memory or the
database.

## 11. Runtime and Recovery

At worker startup, run a reconciliation pass:

- Mark abandoned non-terminal deployments as failed.
- Inspect redner-owned containers using Docker labels.
- Restore project runtime status from the active container state.
- Remove orphan candidate containers and expired temporary directories.
- Never delete the image or container referenced by an active deployment.

Use Docker labels for project ID, deployment ID, and redner ownership. Routing
belongs in generated Caddy fragments rather than Docker labels. Do not rely on
parsing container names as the source of truth.

`stop` stops the active container and marks the project `stopped`. `restart`
starts the same successful image again and health-checks it. `deploy` builds the
latest selected branch. `delete` removes redner-owned project containers and
images only after confirmation.

## 12. Minimal UI

### Projects page

- Project name, runtime status, and application URL
- New project action
- Empty, loading, and error states

### New project page

- Name, slug, public GitHub URL, branch, and app port
- Inline validation and a create button

### Project page

- Repository and runtime configuration
- Deploy, stop, restart, and delete actions
- Current application URL and health state
- Deployment history with status, commit, and timestamps

### Deployment page

- Deployment status and failure reason
- Terminal-style log viewer
- Stored backlog followed by SSE updates
- Automatic reconnection and optional auto-scroll

## 13. Local Routing

Caddy and application containers share a Docker network named `redner_proxy`.
The base `Caddyfile` imports generated files from `routes/*.caddy`. Each project
fragment uses its slug as a local host rule:

```text
todo-api.localhost
blog.localhost
```

Example generated fragment:

```caddyfile
http://todo-api.localhost {
  reverse_proxy redner-todo-api-deployment-id:3000 {
    health_uri /
  }
}
```

Modern browsers resolve `*.localhost` to the loopback interface. Document an
`/etc/hosts` fallback for environments that do not. The explicit `http://` prefix
keeps local development on HTTP and avoids installing a local certificate
authority. Caddy is the only process
that publishes the HTTP port; individual application containers do not publish
random host ports in the final local flow.

The worker writes route fragments to a directory mounted into the Caddy
container, then runs `caddy validate` and `caddy reload` inside that container.
Caddy does not receive the Docker socket, and its admin endpoint remains bound
inside the container.

## 14. Optional Single-VPS Exercise

After the local MVP works:

1. Place redner on a disposable or private VPS.
2. Point a wildcard DNS record such as `*.apps.example.com` at the VPS.
3. Open ports 80 and 443 for Caddy.
4. Remove the local `http://` prefix from public route hostnames so Caddy enables
   automatic HTTPS and obtains per-subdomain certificates.
5. Protect the redner dashboard with a VPN or server-level authentication.
6. Keep only deployed application routes publicly reachable.

Wildcard certificates require a DNS challenge and provider credentials, so they
are deliberately outside this exercise. Per-subdomain certificates use Caddy's
standard automatic HTTPS flow.

## 15. First Test Application

Use a tiny application that includes a `Dockerfile`, listens on `0.0.0.0`, and
responds successfully on `/`:

```json
{
  "message": "Hello from redner"
}
```

This single repository should be used through every phase before trying larger
applications.
