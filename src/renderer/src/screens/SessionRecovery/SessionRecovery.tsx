import { useI18n } from "../../components/useI18n";
import { usePlatform } from "../../platform/usePlatform";

export default function SessionRecovery(): React.JSX.Element {
  const { sessionRecoveryReason } = usePlatform();
  const { t } = useI18n();

  return (
    <div className="initializing-screen">
      <div className="initializing-card">
        <h1 className="initializing-title">{t("platform.sessionRecoveryTitle")}</h1>
        <p className="initializing-hint">{t("platform.sessionRecoveryHint")}</p>
        <p className="initializing-note">{t("platform.sessionRecoveryReturning")}</p>
        {sessionRecoveryReason ? (
          <div className="initializing-error-raw">
            {t("platform.sessionRecoveryReasonLabel")}: {sessionRecoveryReason}
          </div>
        ) : null}
      </div>
    </div>
  );
}
