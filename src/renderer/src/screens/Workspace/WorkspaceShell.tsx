import type { WorkspaceBootstrap } from "../../../../shared/platform/contracts";
import Layout from "../Layout/Layout";

export default function WorkspaceShell({
  workspace,
}: {
  workspace: WorkspaceBootstrap;
}): React.JSX.Element {
  return (
    <div className="workspace-shell">
      <Layout gatewayVisible={workspace.features.gatewayVisible} />
    </div>
  );
}
