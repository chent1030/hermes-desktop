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
    <article className="platform-admin-card min-h-0">
      <p className="platform-admin-section-label">KPI</p>
      <h3 className="text-3xl font-semibold tracking-tight text-slate-950">{value}</h3>
      <p className="mt-2 text-sm text-slate-600">{label}</p>
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
      <article className="platform-admin-card min-h-0">
        <p className="platform-admin-section-label">Overview</p>
        <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
          {copy.workspace.overviewTitle}
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-600">{copy.workspace.overviewDesc}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
          <span className="rounded-full bg-slate-100 px-3 py-1.5">
            {copy.workspace.selectedTenant}: {tenant ? `${tenant.name} (${tenant.code})` : copy.workspace.noTenantSelected}
          </span>
          <button className="platform-admin-secondary-button" type="button" onClick={() => onNavigate("audit")}>
            {copy.workspace.audit}
          </button>
          <button className="platform-admin-secondary-button" type="button" onClick={() => onNavigate("sessions")}>
            {copy.workspace.sessions}
          </button>
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
