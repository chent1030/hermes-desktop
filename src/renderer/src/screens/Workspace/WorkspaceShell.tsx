import type { AuditStatus } from "../../../../shared/platform/audit";
import type { WorkspaceBootstrap } from "../../../../shared/platform/contracts";
import { useI18n } from "../../components/useI18n";
import Layout from "../Layout/Layout";
import WorkspaceBanner from "./WorkspaceBanner";

function getAuditStatusLabel(
  audit: AuditStatus | null,
  t: (key: string) => string,
): string {
  if (!audit || audit.health === "healthy") {
    return t("platform.auditHealthy");
  }

  if (audit.health === "degraded") {
    return t("platform.auditDegraded");
  }

  if (audit.health === "buffering") {
    return t("platform.auditBuffering");
  }

  return t("platform.auditReauthRequired");
}

export default function WorkspaceShell({
  workspace,
  audit = null,
}: {
  workspace: WorkspaceBootstrap;
  audit?: AuditStatus | null;
}): React.JSX.Element {
  const { t } = useI18n();
  const selectedModel =
    workspace.models.find((model) => model.id === workspace.selectedModelId)?.label ||
    workspace.selectedModelId ||
    t("platform.currentModelFallback");

  return (
    <div className="workspace-shell">
      <WorkspaceBanner audit={audit} />
      <div className="workspace-shell-meta">
        <div className="workspace-shell-meta-item">
          <span className="workspace-shell-meta-label">{t("platform.tenant")}</span>
          <strong className="workspace-shell-meta-value">{workspace.tenant.name}</strong>
        </div>
        <div className="workspace-shell-meta-item">
          <span className="workspace-shell-meta-label">{t("platform.account")}</span>
          <strong className="workspace-shell-meta-value">
            {workspace.user.displayName}
          </strong>
        </div>
        <div className="workspace-shell-meta-item">
          <span className="workspace-shell-meta-label">
            {t("platform.currentModel")}
          </span>
          <strong className="workspace-shell-meta-value">{selectedModel}</strong>
        </div>
        <div className="workspace-shell-meta-item">
          <span className="workspace-shell-meta-label">
            {t("platform.auditStatus")}
          </span>
          <strong className="workspace-shell-meta-value">
            {getAuditStatusLabel(audit, t)}
          </strong>
        </div>
      </div>
      <Layout gatewayVisible={workspace.features.gatewayVisible} />
    </div>
  );
}
