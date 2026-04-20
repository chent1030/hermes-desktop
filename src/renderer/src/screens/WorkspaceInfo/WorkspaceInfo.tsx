import type { AuditHealth, AuditStatus } from "../../../../shared/platform/audit";
import { useI18n } from "../../components/useI18n";
import { usePlatform } from "../../platform/usePlatform";

function getAuditLabel(
  health: AuditHealth | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (health === "degraded") {
    return t("platform.auditDegraded");
  }

  if (health === "buffering") {
    return t("platform.auditBuffering");
  }

  if (health === "reauth-required") {
    return t("platform.auditReauthRequired");
  }

  return t("platform.auditHealthy");
}

function getAuditHint(
  audit: AuditStatus | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!audit || audit.health === "healthy") {
    return t("platform.workspaceInfoAuditHealthyHint");
  }

  if (audit.health === "buffering") {
    return t("platform.auditBufferingHint");
  }

  if (audit.health === "degraded") {
    return t("platform.auditDegradedHint");
  }

  return t("platform.auditReauthHint");
}

export default function WorkspaceInfo(): React.JSX.Element {
  const { t } = useI18n();
  const { workspace, audit, refreshSession, retryInitialization, logout } =
    usePlatform();

  const selectedModel =
    workspace?.models.find((model) => model.id === workspace.selectedModelId)?.label ||
    workspace?.selectedModelId ||
    t("platform.currentModelFallback");
  const showRetryAudit =
    audit?.health === "buffering" || audit?.health === "degraded";

  return (
    <div className="settings-container workspace-info-page">
      <header className="workspace-info-header">
        <h1 className="settings-header">{t("platform.workspaceInfoTitle")}</h1>
        <p className="workspace-info-description">
          {t("platform.workspaceInfoDescription")}
        </p>
      </header>

      <section className="settings-card">
        <h2 className="workspace-info-section-title">
          {t("platform.workspaceInfoIdentity")}
        </h2>
        <div className="settings-detail-grid">
          <div className="settings-detail-item">
            <div className="settings-detail-label">{t("platform.tenant")}</div>
            <div className="settings-detail-value">{workspace?.tenant.name ?? "-"}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoTenantCode")}
            </div>
            <div className="settings-detail-value">{workspace?.tenant.code ?? "-"}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoDisplayName")}
            </div>
            <div className="settings-detail-value">
              {workspace?.user.displayName ?? "-"}
            </div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoUsername")}
            </div>
            <div className="settings-detail-value">{workspace?.user.username ?? "-"}</div>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <h2 className="workspace-info-section-title">
          {t("platform.workspaceInfoStatus")}
        </h2>
        <div className="settings-detail-grid">
          <div className="settings-detail-item">
            <div className="settings-detail-label">{t("platform.currentModel")}</div>
            <div className="settings-detail-value">{selectedModel}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">{t("platform.auditStatus")}</div>
            <div className="settings-detail-value">{getAuditLabel(audit?.health, t)}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoAuditLocal")}
            </div>
            <div className="settings-detail-value">
              {getAuditLabel(audit?.localHealth, t)}
            </div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoAuditRemote")}
            </div>
            <div className="settings-detail-value">
              {getAuditLabel(audit?.remoteHealth, t)}
            </div>
          </div>
        </div>
      </section>

      <section
        className={`settings-card workspace-info-audit workspace-info-audit-${audit?.health ?? "healthy"}`}
      >
        <h2 className="workspace-info-section-title">
          {t("platform.workspaceInfoAuditDetails")}
        </h2>
        <p className="workspace-info-description">{getAuditHint(audit, t)}</p>
        <div className="settings-detail-grid">
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoQueued")}
            </div>
            <div className="settings-detail-value">
              {t("platform.auditQueued", { count: audit?.queuedEvents ?? 0 })}
            </div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoDropped")}
            </div>
            <div className="settings-detail-value">
              {t("platform.auditDropped", { count: audit?.droppedEvents ?? 0 })}
            </div>
          </div>
          <div className="settings-detail-item workspace-info-full-span">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoLastError")}
            </div>
            <div className="settings-detail-value">{audit?.lastError ?? "-"}</div>
          </div>
        </div>
        {showRetryAudit && (
          <div className="workspace-info-actions-row">
            <button
              className="btn btn-secondary"
              onClick={() => void window.hermesAPI.retryAuditFlush()}
            >
              {t("platform.retryAuditUpload")}
            </button>
          </div>
        )}
      </section>

      <section className="settings-card">
        <h2 className="workspace-info-section-title">
          {t("platform.workspaceInfoActions")}
        </h2>
        <div className="workspace-info-actions-row">
          <button className="btn btn-secondary" onClick={() => void refreshSession()}>
            {t("platform.refreshSession")}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => void retryInitialization()}
          >
            {t("platform.reinitialize")}
          </button>
          <button className="btn btn-primary" onClick={() => void logout()}>
            {t("platform.signOut")}
          </button>
        </div>
      </section>
    </div>
  );
}
