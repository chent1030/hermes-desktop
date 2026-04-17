import { useI18n } from "../../components/useI18n";
import { usePlatform } from "../../platform/usePlatform";

export default function Initializing(): React.JSX.Element {
  const { initError, retryInitialization } = usePlatform();
  const { t } = useI18n();

  return (
    <div className="initializing-screen">
      <h1>{t("platform.initializingTitle")}</h1>
      <p>{t("platform.initializingHint")}</p>
      {initError && (
        <>
          <div className="initializing-error">{initError}</div>
          <button onClick={() => void retryInitialization()}>
            {t("platform.retry")}
          </button>
        </>
      )}
    </div>
  );
}
