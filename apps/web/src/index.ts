import type { WorkspaceInfo } from "@redner/shared";

export const workspace: WorkspaceInfo = {
  name: "web",
  kind: "application",
};

if (process.env.NODE_ENV !== "test") {
  console.log("redner web workspace is ready");
}
