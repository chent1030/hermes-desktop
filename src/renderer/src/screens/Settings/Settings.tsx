import { useI18n } from "../../components/useI18n";
import { usePlatform } from "../../platform/usePlatform";

export default function Settings(_props: {
  profile?: string;
  visible?: boolean;
}): React.JSX.Element {
  const { locale, setLocale, t } = useI18n();
  const { audit, logout, retryInitialization, workspace } = usePlatform();

  const auditLabel =
    audit?.health === "degraded"
      ? t("settings.status.degraded")
      : audit?.health === "buffering"
        ? t("settings.status.buffering")
        : audit?.health === "reauth-required"
          ? t("settings.status.reauthRequired")
          : t("settings.status.healthy");

  return (
    <div className="settings-container">
      <h1 className="settings-header">{t("platform.accountTitle")}</h1>

      <div className="settings-card">
        <div>{workspace?.tenant.name}</div>
        <div>{workspace?.user.displayName}</div>
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
        <div>{t("settings.status.initialization")}</div>
        <div>{t("settings.status.completed")}</div>
        <div>{t("settings.status.audit")}</div>
        <div>{auditLabel}</div>
        {audit && (
          <>
            <div>{t("settings.status.queued", { count: audit.queuedEvents })}</div>
            <div>{t("settings.status.dropped", { count: audit.droppedEvents })}</div>
            {audit.lastError && <div>{audit.lastError}</div>}
          </>
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
