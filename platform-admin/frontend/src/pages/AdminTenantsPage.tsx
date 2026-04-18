import type { AdminCopy } from "../adminI18n";
import type { TenantRecord } from "../adminTypes";

interface AdminTenantsPageProps {
  copy: AdminCopy;
  tenantForm: { code: string; name: string };
  onTenantFormChange: (patch: Partial<{ code: string; name: string }>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  tenants: TenantRecord[];
  selectedTenantId: number | null;
  onSelectTenant: (tenantId: number) => void;
  onDeactivateTenant: (tenantId: number) => void;
}

export function AdminTenantsPage({
  copy,
  tenantForm,
  onTenantFormChange,
  onSubmit,
  tenants,
  selectedTenantId,
  onSelectTenant,
  onDeactivateTenant,
}: AdminTenantsPageProps): React.JSX.Element {
  return (
    <article className="platform-admin-card platform-admin-stack-card platform-admin-resource-page">
      <div className="platform-admin-resource-head">
        <div>
          <p className="platform-admin-section-label">{copy.tenantControl.section}</p>
          <h3>{copy.tenantControl.createTitle}</h3>
        </div>
        <span className="platform-admin-resource-count">{tenants.length}</span>
      </div>

      <div className="platform-admin-resource-layout">
        <section className="platform-admin-resource-editor">
          <form className="platform-admin-form" onSubmit={onSubmit}>
            <label className="platform-admin-field">
              <span>{copy.tenantControl.tenantCode}</span>
              <input
                value={tenantForm.code}
                onChange={(event) => onTenantFormChange({ code: event.target.value })}
              />
            </label>
            <label className="platform-admin-field">
              <span>{copy.tenantControl.tenantName}</span>
              <input
                value={tenantForm.name}
                onChange={(event) => onTenantFormChange({ name: event.target.value })}
              />
            </label>
            <button className="platform-admin-submit" type="submit">
              {copy.tenantControl.createButton}
            </button>
          </form>
        </section>

        <section className="platform-admin-resource-list-panel">
          <div className="platform-admin-list">
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                className={`platform-admin-list-item platform-admin-resource-record${selectedTenantId === tenant.id ? " is-selected" : ""}`}
                onClick={() => onSelectTenant(tenant.id)}
              >
                <div className="platform-admin-resource-record-head">
                  <span className="platform-admin-resource-record-title">{tenant.name}</span>
                  <small>{tenant.isActive ? copy.common.active : copy.common.inactive}</small>
                </div>
                <div className="platform-admin-resource-record-meta">
                  <small>{tenant.code}</small>
                  {selectedTenantId === tenant.id ? <small>{copy.workspace.selectedTenant}</small> : null}
                </div>
              </button>
            ))}
          </div>
          {selectedTenantId ? (
            <div className="platform-admin-resource-actions">
              <button
                className="platform-admin-secondary-button"
                type="button"
                onClick={() => onDeactivateTenant(selectedTenantId)}
              >
                {copy.tenantControl.deactivateButton}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </article>
  );
}
