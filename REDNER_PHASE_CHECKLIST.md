# redner Phase Checklist

Build the smallest complete deployment path first. Finish each phase and its
verification before moving to the next one.

## Phase 0: Workspace

### Build

- [x] Initialize npm workspaces for `apps/*` and `packages/*`
- [x] Create `apps/web`, `apps/api`, and `apps/worker`
- [x] Create `packages/database` and `packages/shared`
- [x] Add shared TypeScript configuration
- [x] Add `.gitignore` and `.env.example`
- [x] Add root scripts for development, type-checking, and tests

### Done when

- [x] `npm install` succeeds from the repository root
- [x] All workspaces can import shared types
- [x] Required configuration is documented in `.env.example`

## Phase 1: Local Infrastructure

### Build

- [x] Add PostgreSQL, Redis, and Caddy to `docker-compose.yml`
- [x] Add persistent state for PostgreSQL and Caddy
- [x] Create the shared `redner_proxy` Docker network
- [x] Add a base `Caddyfile` that imports `routes/*.caddy`
- [x] Mount the generated routes directory into the Caddy container
- [x] Keep Caddy's admin endpoint internal and do not mount the Docker socket
- [x] Add service health checks to Docker Compose

### Done when

- [x] `docker compose up -d` starts all three services
- [x] PostgreSQL and Redis health checks pass
- [x] Caddy accepts an empty imported routes directory and serves its health check

## Phase 2: Database and API

### Build

- [x] Add Prisma models for Project, Deployment, and Log
- [x] Add separate project and deployment status enums
- [x] Add `activeDeploymentId` and the deployment configuration snapshot
- [x] Add unique deployment log sequence numbers
- [x] Create and run the initial migration
- [x] Initialize Fastify with configuration validation and a shared error format
- [x] Add `GET /health` with database and Redis checks
- [x] Add request logging without sensitive values

### Done when

- [x] The migration succeeds on an empty database
- [x] Prisma can create and read all three models
- [x] `GET /health` reports dependency status accurately

## Phase 3: Project CRUD and Dashboard

### Build

- [x] Implement `POST /projects`
- [x] Implement `GET /projects` and `GET /projects/:id`
- [x] Implement `DELETE /projects/:id` for projects without active work
- [x] Validate names, DNS-safe unique slugs, GitHub HTTPS URLs, branches, and ports
- [x] Initialize the Next.js and Tailwind dashboard
- [x] Add projects, new project, and project detail pages
- [x] Add loading, empty, validation, and API error states

### Done when

- [x] A valid project can be created and viewed from the browser
- [x] Invalid or duplicate input returns a useful error
- [x] A project can be deleted without leaving database records

## Phase 4: Queue and Worker

### Build

- [x] Create a shared Redis connection configuration
- [x] Create the BullMQ deployment queue
- [x] Implement `POST /projects/:id/deploy`
- [x] Create the deployment record before enqueuing its job
- [x] Reject a second active deployment for the same project
- [x] Start a worker that receives deployment IDs rather than raw configuration
- [x] Add a per-project deployment lock and bounded retry policy
- [x] Publish system log events and persist them with increasing sequence IDs

### Done when

- [x] Deploy returns promptly with a queued deployment
- [x] The worker loads its configuration snapshot from PostgreSQL
- [x] Duplicate deploy requests cannot create concurrent project jobs
- [x] Worker errors produce a failed deployment and readable log

## Phase 5: Clone and Build

### Build

- [x] Create a unique temporary directory per deployment
- [x] Execute processes with argument arrays and `shell: false`
- [x] Shallow-clone the selected public GitHub branch
- [x] Record the resolved commit hash
- [x] Reject repositories without a root `Dockerfile`
- [x] Build an image tagged with project and deployment IDs
- [x] Stream bounded stdout and stderr into ordered build logs
- [x] Add clone and build timeouts
- [x] Clean temporary directories on success and failure

### Done when

- [x] The test repository produces a Docker image
- [x] Invalid repositories, branches, and builds fail cleanly
- [x] User-controlled values are never interpolated into shell strings
- [x] Clone and build logs appear in correct order

## Phase 6: Container Lifecycle

### Build

- [ ] Start a uniquely named candidate container from the built image
- [ ] Add ownership, project, and deployment Docker labels
- [ ] Attach the candidate to `redner_proxy`
- [ ] Apply CPU, memory, and PID limits plus `no-new-privileges`
- [ ] Do not mount the Docker socket or sensitive host paths
- [ ] Add a bounded HTTP health check for the configured app port
- [ ] Generate a Caddy route fragment for the healthy candidate
- [ ] Validate and gracefully reload Caddy before promotion
- [ ] Promote the routed candidate through `activeDeploymentId`
- [ ] Stop and remove the previous container only after promotion
- [ ] Keep the previous version active when startup fails
- [ ] Implement project stop and restart actions

### Done when

- [ ] A healthy image becomes the active running project
- [ ] An unhealthy replacement fails without stopping the old version
- [ ] Stop and restart update actual container and database state
- [ ] At most one promoted container remains after deployment completes

## Phase 7: Stored and Live Logs

### Build

- [ ] Collect build, system, and runtime log types
- [ ] Add `GET /deployments/:id/logs` with ordered pagination
- [ ] Publish new log records through Redis Pub/Sub
- [ ] Add `GET /deployments/:id/logs/stream` as `text/event-stream`
- [ ] Send stored backlog before live SSE events
- [ ] Add SSE IDs, heartbeat comments, and reconnection support
- [ ] Add the deployment log page and terminal-style viewer
- [ ] Cap line length and retained lines per deployment

### Done when

- [ ] Build logs appear while a deployment is running
- [ ] Refreshing the page restores stored history without duplicates
- [ ] Runtime logs appear after the deployment succeeds
- [ ] Disconnecting and reconnecting resumes from the last event ID

## Phase 8: Local Routing

### Build

- [ ] Generate one Caddy route fragment from the validated project slug
- [ ] Route `project-slug.localhost` to the configured container port
- [ ] Write route fragments atomically, then validate the complete Caddyfile
- [ ] Gracefully reload Caddy and preserve the old route if reload fails
- [ ] Publish HTTP only through Caddy
- [ ] Display the application URL on project pages
- [ ] Document an `/etc/hosts` fallback for unsupported environments

### Done when

- [ ] Two projects route to different containers by hostname
- [ ] Redeployment keeps the stable project URL
- [ ] Application containers do not require random published host ports

## Phase 9: Recovery and Cleanup

### Build

- [ ] Reconcile project state with labeled Docker containers at worker startup
- [ ] Mark abandoned non-terminal deployments as failed
- [ ] Remove orphan candidate containers and expired temporary directories
- [ ] Remove old inactive images while preserving the active image
- [ ] Make deployment retries idempotent
- [ ] Add clear failure reasons and action confirmation dialogs
- [ ] Test API, worker, Redis, and Docker restart scenarios

### Done when

- [ ] Restarting redner restores accurate runtime state
- [ ] Retried jobs do not create duplicate active containers
- [ ] Failed deployments leave no candidate containers or temp directories
- [ ] Cleanup never removes active project resources

## Phase 10: Optional Single-VPS Exercise

Do this only after the local MVP is complete.

### Build

- [ ] Provision a disposable or private single VPS
- [ ] Point `*.apps.example.com` at the VPS
- [ ] Configure Caddy on ports 80 and 443
- [ ] Enable Caddy automatic HTTPS for public application hostnames
- [ ] Generate application URLs under the selected base domain
- [ ] Protect the redner dashboard with a VPN or server-level authentication
- [ ] Confirm that only deployed application routes are public

### Done when

- [ ] A deployed application is reachable over HTTPS
- [ ] The dashboard is not anonymously accessible from the internet
- [ ] Certificate renewal and container restart behavior are verified

## Final MVP Check

- [ ] Create a project from the dashboard
- [ ] Queue a deployment without blocking the API
- [ ] Clone and build the trusted test repository
- [ ] View stored and live deployment logs
- [ ] Health-check and promote the candidate container
- [ ] Keep the old version running when replacement startup fails
- [ ] Open the application at its stable local subdomain
- [ ] Stop, restart, redeploy, and delete the project
- [ ] Restart redner and recover correct state
- [ ] Clean failed and inactive resources safely

## Deferred Features

Do not add these before the final MVP check passes:

- Authentication, teams, or billing
- Private repositories or Git provider OAuth
- GitHub webhooks and automatic deployments
- Environment-variable or secret management
- Rollbacks and preview environments
- Scaling, Kubernetes, or multiple hosts
- Managed databases or persistent application storage
- Advanced metrics, alerts, or external log systems
- Docker Compose imports or provider portability
