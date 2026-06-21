-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('idle', 'running', 'unhealthy', 'stopped');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('queued', 'cloning', 'building', 'starting', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "DeploymentTrigger" AS ENUM ('manual', 'restart');

-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('system', 'build', 'runtime');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "appPort" INTEGER NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'idle',
    "activeDeploymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'queued',
    "trigger" "DeploymentTrigger" NOT NULL DEFAULT 'manual',
    "snapshotRepoUrl" TEXT NOT NULL,
    "snapshotBranch" TEXT NOT NULL,
    "snapshotSlug" TEXT NOT NULL,
    "snapshotAppPort" INTEGER NOT NULL,
    "commitHash" TEXT,
    "imageName" TEXT,
    "containerId" TEXT,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Log" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "LogType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Project_activeDeploymentId_key" ON "Project"("activeDeploymentId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Deployment_projectId_createdAt_idx" ON "Deployment"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Deployment_status_idx" ON "Deployment"("status");

-- CreateIndex
CREATE INDEX "Log_deploymentId_createdAt_idx" ON "Log"("deploymentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Log_deploymentId_sequence_key" ON "Log"("deploymentId", "sequence");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_activeDeploymentId_fkey" FOREIGN KEY ("activeDeploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "Log_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
