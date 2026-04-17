import { useI18n } from "../../components/useI18n";
import { usePlatform } from "../../platform/usePlatform";

export default function Settings(_props: {
  profile?: string;
  visible?: boolean;
}): React.JSX.Element {
  const { locale, setLocale, t } = useI18n();
  const { logout, retryInitialization, workspace } = usePlatform();

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
          <option value="en">English</option>
          <option value="zh-CN">简体中文</option>
        </select>
      </label>

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
