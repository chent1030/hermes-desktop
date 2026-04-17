import type { AuditStatus } from "../../../../shared/platform/audit";

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
      {audit.health === "buffering" &&
        "Audit upload interrupted. Events are buffering in memory."}
      {audit.health === "degraded" &&
        "Audit upload is degraded. Retry is recommended."}
      {audit.health === "reauth-required" &&
        "Session expired. Please sign in again."}
    </div>
  );
}
