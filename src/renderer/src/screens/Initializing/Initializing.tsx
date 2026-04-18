import { useI18n } from "../../components/useI18n";
import { usePlatform } from "../../platform/usePlatform";

function describeInitError(
  message: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): {
  stage: string;
  hint: string;
} {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("bootstrap") ||
    normalized.includes("tenant") ||
    normalized.includes("platform context")
  ) {
    return {
      stage: t("platform.initStageBootstrap"),
      hint: t("platform.initBootstrapHint"),
    };
  }

  if (normalized.includes("model")) {
    return {
      stage: t("platform.initStageModels"),
      hint: t("platform.initModelsHint"),
    };
  }

  if (normalized.includes("skill")) {
    return {
      stage: t("platform.initStageSkills"),
      hint: t("platform.initSkillsHint"),
    };
  }

  return {
    stage: t("platform.initStageGeneric"),
    hint: t("platform.initGenericHint"),
  };
}

export default function Initializing(): React.JSX.Element {
  const { initError, retryInitialization } = usePlatform();
  const { t } = useI18n();
  const errorDetails = initError ? describeInitError(initError, t) : null;

  return (
    <div className="initializing-screen">
      <h1>{t("platform.initializingTitle")}</h1>
      <p>{t("platform.initializingHint")}</p>
      {initError && errorDetails && (
        <>
          <div className="initializing-error">
            {t("platform.initFailureStage", { stage: errorDetails.stage })}
          </div>
          <div className="initializing-error-hint">{errorDetails.hint}</div>
          <div className="initializing-error-raw">
            {t("platform.initRawErrorLabel")}: {initError}
          </div>
          <button onClick={() => void retryInitialization()}>
            {t("platform.retry")}
          </button>
        </>
      )}
    </div>
  );
}
