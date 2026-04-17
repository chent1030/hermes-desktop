import type { AuditStatus } from "../../../../shared/platform/audit";
import type { WorkspaceBootstrap } from "../../../../shared/platform/contracts";
import Layout from "../Layout/Layout";
import WorkspaceBanner from "./WorkspaceBanner";

export default function WorkspaceShell({
  workspace,
  audit = null,
}: {
  workspace: WorkspaceBootstrap;
  audit?: AuditStatus | null;
}): React.JSX.Element {
  return (
    <div className="workspace-shell">
      <WorkspaceBanner audit={audit} />
      <div className="workspace-shell-meta">
        <span>{workspace.tenant.name}</span>
        <span>{workspace.user.displayName}</span>
        <span>
          {
            workspace.models.find(
              (model) => model.id === workspace.selectedModelId,
            )?.label
          }
        </span>
      </div>
      <Layout gatewayVisible={workspace.features.gatewayVisible} />
    </div>
  );
}
