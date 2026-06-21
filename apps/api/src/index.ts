import type { WorkspaceInfo } from "@redner/shared";

export const workspace: WorkspaceInfo = {
  name: "api",
  kind: "application",
};

if (process.env.NODE_ENV !== "test") {
  console.log("redner API workspace is ready");
}
