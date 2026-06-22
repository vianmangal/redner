export interface DeploymentCancellationHandle {
  signal: AbortSignal;
  release(): void;
}

export interface DeploymentCancellationManager {
  register(deploymentId: string): DeploymentCancellationHandle;
  cancel(deploymentId: string): boolean;
}

export class LocalDeploymentCancellationManager
  implements DeploymentCancellationManager
{
  private readonly controllers = new Map<string, AbortController>();

  register(deploymentId: string): DeploymentCancellationHandle {
    const controller = new AbortController();
    this.controllers.set(deploymentId, controller);
    return {
      signal: controller.signal,
      release: () => {
        if (this.controllers.get(deploymentId) === controller) {
          this.controllers.delete(deploymentId);
        }
      },
    };
  }

  cancel(deploymentId: string): boolean {
    const controller = this.controllers.get(deploymentId);
    if (controller === undefined) return false;
    controller.abort();
    return true;
  }
}
