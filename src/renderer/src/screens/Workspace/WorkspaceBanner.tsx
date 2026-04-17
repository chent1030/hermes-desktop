import type { AuditStatus } from "../../../../shared/platform/audit";
import { useI18n } from "../../components/useI18n";

function getBannerTitle(
  audit: AuditStatus,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (audit.health === "reauth-required") {
    return t("platform.auditBlockedTitle");
  }

  return t("platform.auditWarningTitle");
}

function getBannerMessage(
  audit: AuditStatus,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (audit.health === "buffering") {
    return t("platform.auditBufferingHint");
  }

  if (audit.health === "degraded") {
    return t("platform.auditDegradedHint");
  }

  return t("platform.auditReauthHint");
}

export default function WorkspaceBanner({
  audit,
}: {
  audit: AuditStatus | null;
}): React.JSX.Element | null {
  const { t } = useI18n();

  if (!audit || audit.health === "healthy") {
    return null;
  }

  return (
    <div className={`workspace-banner workspace-banner-${audit.health}`}>
      <strong>{getBannerTitle(audit, t)}</strong>
      <div>{getBannerMessage(audit, t)}</div>
      <div>{t("platform.auditQueued", { count: audit.queuedEvents })}</div>
      <div>{t("platform.auditDropped", { count: audit.droppedEvents })}</div>
      {audit.lastError && <div>{audit.lastError}</div>}
      {(audit.health === "buffering" || audit.health === "degraded") && (
        <button onClick={() => void window.hermesAPI.retryAuditFlush()}>
          {t("platform.retryAuditUpload")}
        </button>
      )}
    </div>
  );
}
