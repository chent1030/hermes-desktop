import { useI18n } from "../../components/useI18n";
import { usePlatform } from "../../platform/usePlatform";
import type { WorkspaceInitStatus } from "../../../../shared/platform/init";

const INIT_STEPS = [
  "login-complete",
  "bootstrap",
  "models",
  "skills",
] as const;

type InitStep = (typeof INIT_STEPS)[number];

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

function getStepLabel(
  step: InitStep,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (step === "login-complete") {
    return t("platform.initStepLoginComplete");
  }
  if (step === "bootstrap") {
    return t("platform.initStepBootstrap");
  }
  if (step === "models") {
    return t("platform.initStepModels");
  }
  return t("platform.initStepSkills");
}

function getStepState(
  step: InitStep,
  initStatus: WorkspaceInitStatus,
): "pending" | "active" | "completed" | "failed" {
  if (initStatus.phase === "idle") {
    return "pending";
  }

  if (initStatus.phase === "completed") {
    return "completed";
  }

  const effectivePhase =
    initStatus.phase === "failed" ? initStatus.failedPhase : initStatus.phase;
  const currentIndex = effectivePhase ? INIT_STEPS.indexOf(effectivePhase) : -1;
  const stepIndex = INIT_STEPS.indexOf(step);

  if (
    initStatus.phase === "failed" &&
    initStatus.failedPhase &&
    initStatus.failedPhase === step
  ) {
    return "failed";
  }

  if (stepIndex < currentIndex) {
    return "completed";
  }

  if (stepIndex === currentIndex) {
    return "active";
  }

  return "pending";
}

function getStepStateLabel(
  state: "pending" | "active" | "completed" | "failed",
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (state === "active") {
    return t("platform.initStepActive");
  }
  if (state === "completed") {
    return t("platform.initStepCompleted");
  }
  if (state === "failed") {
    return t("platform.initStepFailed");
  }
  return t("platform.initStepPending");
}

export default function Initializing(): React.JSX.Element {
  const { initError, initStatus, retryInitialization } = usePlatform();
  const { t } = useI18n();
  const errorDetails = initError ? describeInitError(initError, t) : null;
  const currentInitStatus: WorkspaceInitStatus = initStatus || {
    phase: "idle",
    failedPhase: null,
    lastError: null,
  };

  return (
    <div className="initializing-screen">
      <h1>{t("platform.initializingTitle")}</h1>
      <p>{t("platform.initializingHint")}</p>
      <div className="initializing-steps">
        {INIT_STEPS.map((step) => {
          const stepState = getStepState(step, currentInitStatus);
          return (
            <div
              key={step}
              className={`initializing-step initializing-step-${stepState}`}
            >
              <strong>{getStepLabel(step, t)}</strong>
              <small>{getStepStateLabel(stepState, t)}</small>
            </div>
          );
        })}
      </div>
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
