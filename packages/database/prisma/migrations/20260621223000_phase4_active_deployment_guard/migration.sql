CREATE UNIQUE INDEX "Deployment_one_active_per_project_idx"
ON "Deployment"("projectId")
WHERE "status" IN ('queued', 'cloning', 'building', 'starting');
