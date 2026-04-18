import { useI18n } from "../../components/useI18n";
import { usePlatform } from "../../platform/usePlatform";

export default function SessionRecovery(): React.JSX.Element {
  const { sessionRecoveryReason } = usePlatform();
  const { t } = useI18n();

  return (
    <div className="initializing-screen">
      <h1>{t("platform.sessionRecoveryTitle")}</h1>
      <p>{t("platform.sessionRecoveryHint")}</p>
      <p>{t("platform.sessionRecoveryReturning")}</p>
      {sessionRecoveryReason ? (
        <div className="initializing-error-raw">
          {t("platform.sessionRecoveryReasonLabel")}: {sessionRecoveryReason}
        </div>
      ) : null}
    </div>
  );
}
