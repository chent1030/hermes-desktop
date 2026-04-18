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
    <article className="platform-admin-card platform-admin-stack-card">
      <p className="platform-admin-section-label">{copy.tenantControl.section}</p>
      <h3>{copy.tenantControl.createTitle}</h3>
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

      <div className="platform-admin-list">
        {tenants.map((tenant) => (
          <button
            key={tenant.id}
            type="button"
            className={`platform-admin-list-item${selectedTenantId === tenant.id ? " is-selected" : ""}`}
            onClick={() => onSelectTenant(tenant.id)}
          >
            <span>{tenant.name}</span>
            <small>{tenant.code}</small>
            <small>{tenant.isActive ? copy.common.active : copy.common.inactive}</small>
          </button>
        ))}
      </div>
      {selectedTenantId ? (
        <button
          className="platform-admin-secondary-button"
          type="button"
          onClick={() => onDeactivateTenant(selectedTenantId)}
        >
          {copy.tenantControl.deactivateButton}
        </button>
      ) : null}
    </article>
  );
}
