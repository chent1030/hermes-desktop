import type { AuditStatus } from "../../../../shared/platform/audit";

function getBannerTitle(audit: AuditStatus): string {
  if (audit.health === "reauth-required") {
    return "Audit blocked";
  }

  return "Audit warning";
}

function getBannerMessage(audit: AuditStatus): string {
  if (audit.health === "buffering") {
    return "Audit upload interrupted. Events are buffering in memory.";
  }

  if (audit.health === "degraded") {
    return "Audit upload is degraded. Retry is recommended.";
  }

  return "Session expired. Please sign in again.";
}

export default function WorkspaceBanner({
  audit,
}: {
  audit: AuditStatus | null;
}): React.JSX.Element | null {
  if (!audit || audit.health === "healthy") {
    return null;
  }

  return (
    <div className={`workspace-banner workspace-banner-${audit.health}`}>
      <strong>{getBannerTitle(audit)}</strong>
      <div>{getBannerMessage(audit)}</div>
      <div>{`Queued: ${audit.queuedEvents}`}</div>
      <div>{`Dropped: ${audit.droppedEvents}`}</div>
      {audit.lastError && <div>{audit.lastError}</div>}
      {(audit.health === "buffering" || audit.health === "degraded") && (
        <button onClick={() => void window.hermesAPI.retryAuditFlush()}>
          Retry audit upload
        </button>
      )}
    </div>
  );
}
