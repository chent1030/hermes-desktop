import { useI18n } from "../../components/useI18n";
import { usePlatform } from "../../platform/usePlatform";
import type { AuditHealth } from "../../../../shared/platform/audit";

function getAuditLabel(
  health: AuditHealth | undefined,
  t: (key: string) => string,
  options: { degradedKey?: string } = {},
): string {
  if (health === "degraded") {
    return options.degradedKey
      ? t(options.degradedKey)
      : t("settings.status.degraded");
  }
  if (health === "buffering") {
    return t("settings.status.buffering");
  }
  if (health === "reauth-required") {
    return t("settings.status.reauthRequired");
  }
  return t("settings.status.healthy");
}

export default function Settings(_props: {
  profile?: string;
  visible?: boolean;
}): React.JSX.Element {
  const { locale, setLocale, t } = useI18n();
  const { audit, logout, retryInitialization, workspace } = usePlatform();
  const selectedModel =
    workspace?.models.find((model) => model.id === workspace.selectedModelId)
      ?.label ?? "-";

  const auditLabel = getAuditLabel(audit?.health, t);
  const auditLocalLabel = getAuditLabel(audit?.localHealth, t);
  const auditRemoteLabel = getAuditLabel(audit?.remoteHealth, t, {
    degradedKey: "settings.status.remoteDegraded",
  });

  return (
    <div className="settings-container">
      <h1 className="settings-header">{t("platform.accountTitle")}</h1>

      <div className="settings-card">
        <div className="settings-detail-grid">
          <div className="settings-detail-item">
            <div className="settings-detail-label">{t("platform.tenant")}</div>
            <div className="settings-detail-value">{workspace?.tenant.name ?? "-"}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("settings.account.tenantCode")}
            </div>
            <div className="settings-detail-value">{workspace?.tenant.code ?? "-"}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">{t("platform.account")}</div>
            <div className="settings-detail-value">
              {workspace
                ? `${workspace.user.displayName} (${workspace.user.username})`
                : "-"}
            </div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.currentModel")}
            </div>
            <div className="settings-detail-value">{selectedModel}</div>
          </div>
        </div>
      </div>

      <label className="settings-label">
        {t("settings.language")}
        <select
          className="input"
          value={locale}
          onChange={(event) =>
            setLocale(event.target.value as "en" | "zh-CN")
          }
        >
          <option value="en">{t("settings.localeNames.en")}</option>
          <option value="zh-CN">{t("settings.localeNames.zhCN")}</option>
        </select>
      </label>

      <div className="settings-card">
        <div className="settings-detail-grid">
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("settings.status.initialization")}
            </div>
            <div className="settings-detail-value">{t("settings.status.completed")}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("settings.status.feedback")}
            </div>
            <div className="settings-detail-value">{t("settings.status.readyHint")}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">{t("settings.status.audit")}</div>
            <div className="settings-detail-value">{auditLabel}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("settings.status.auditLocal")}
            </div>
            <div className="settings-detail-value">{auditLocalLabel}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("settings.status.auditRemote")}
            </div>
            <div className="settings-detail-value">{auditRemoteLabel}</div>
          </div>
        </div>
        {audit && (
          <div className="settings-status-list">
            <div>{t("settings.status.queued", { count: audit.queuedEvents })}</div>
            <div>{t("settings.status.dropped", { count: audit.droppedEvents })}</div>
            {audit.lastError && <div>{audit.lastError}</div>}
          </div>
        )}
      </div>

      <div className="settings-actions">
        <button className="btn btn-secondary" onClick={() => void retryInitialization()}>
          {t("platform.reinitialize")}
        </button>
        <button className="btn btn-primary" onClick={() => void logout()}>
          {t("platform.signOut")}
        </button>
      </div>
    </div>
  );
}
