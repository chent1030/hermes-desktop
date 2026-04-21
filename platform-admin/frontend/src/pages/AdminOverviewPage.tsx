import type { AdminCopy } from "../adminI18n";
import type { SessionTenant, WorkspaceSection } from "../adminTypes";

interface AdminOverviewPageProps {
  copy: AdminCopy;
  tenant: SessionTenant | null;
  tenantCount: number;
  accountCount: number;
  modelCount: number;
  skillCount: number;
  auditCount: number;
  sessionCount: number;
  canManageTenants: boolean;
  onNavigate: (section: WorkspaceSection) => void;
}

function MetricCard({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  return (
    <article className="platform-admin-card platform-admin-metric-card min-h-0">
      <div className="platform-admin-metric-head">
        <p className="platform-admin-section-label">KPI</p>
        <span className="platform-admin-metric-dot" aria-hidden="true" />
      </div>
      <h3 className="platform-admin-metric-value">{value}</h3>
      <p className="platform-admin-metric-label">{label}</p>
    </article>
  );
}

export function AdminOverviewPage({
  copy,
  tenant,
  tenantCount,
  accountCount,
  modelCount,
  skillCount,
  auditCount,
  sessionCount,
  canManageTenants,
  onNavigate,
}: AdminOverviewPageProps): React.JSX.Element {
  return (
    <div className="grid gap-4">
      <article className="platform-admin-card platform-admin-overview-hero min-h-0">
        <div className="platform-admin-overview-head">
          <div>
            <p className="platform-admin-section-label">Overview</p>
            <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
              {copy.workspace.overviewTitle}
            </h3>
          </div>
        </div>
        <p className="platform-admin-overview-description">{copy.workspace.overviewDesc}</p>
        <div className="platform-admin-overview-actions">
          <span className="platform-admin-overview-pill">
            {copy.workspace.selectedTenant}:{" "}
            {tenant ? `${tenant.name} (${tenant.code})` : copy.workspace.noTenantSelected}
          </span>
          <button
            className="platform-admin-secondary-button"
            type="button"
            onClick={() => onNavigate("audit")}
          >
            {copy.workspace.audit}
          </button>
          <button
            className="platform-admin-secondary-button"
            type="button"
            onClick={() => onNavigate("sessions")}
          >
            {copy.workspace.sessions}
          </button>
        </div>
      </article>

      <div className="platform-admin-metric-grid">
        {canManageTenants ? (
          <MetricCard label={copy.workspace.totalTenants} value={tenantCount} />
        ) : null}
        <MetricCard label={copy.workspace.totalAccounts} value={accountCount} />
        <MetricCard label={copy.workspace.totalModels} value={modelCount} />
        <MetricCard label={copy.workspace.totalSkills} value={skillCount} />
        <MetricCard label={copy.workspace.totalAuditEvents} value={auditCount} />
        <MetricCard label={copy.workspace.totalSessions} value={sessionCount} />
      </div>
    </div>
  );
}
