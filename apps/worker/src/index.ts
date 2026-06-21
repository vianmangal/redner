import type { WorkspaceInfo } from "@redner/shared";

export const workspace: WorkspaceInfo = {
  name: "worker",
  kind: "application",
};

if (process.env.NODE_ENV !== "test") {
  console.log("redner worker workspace is ready");
}
