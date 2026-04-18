import type { AdminCopy } from "../adminI18n";
import type { AdminAccountRecord, RoleCode } from "../adminTypes";

interface AccountForm {
  username: string;
  displayName: string;
  password: string;
  roleCode: RoleCode;
}

interface AdminAccountsPageProps {
  copy: AdminCopy;
  title: string;
  showRoleSelector: boolean;
  accountForm: AccountForm;
  onAccountFormChange: (patch: Partial<AccountForm>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  accounts: AdminAccountRecord[];
  roleLabel: (roleCode: RoleCode) => string;
  onDeactivate: (accountId: number) => void;
}

export function AdminAccountsPage({
  copy,
  title,
  showRoleSelector,
  accountForm,
  onAccountFormChange,
  onSubmit,
  accounts,
  roleLabel,
  onDeactivate,
}: AdminAccountsPageProps): React.JSX.Element {
  return (
    <article className="platform-admin-card platform-admin-stack-card platform-admin-resource-page">
      <div className="platform-admin-resource-head">
        <div>
          <p className="platform-admin-section-label">{copy.accountControl.section}</p>
          <h3>{title}</h3>
        </div>
        <span className="platform-admin-resource-count">{accounts.length}</span>
      </div>

      <div className="platform-admin-resource-layout">
        <section className="platform-admin-resource-editor">
          <form className="platform-admin-form" onSubmit={onSubmit}>
            <label className="platform-admin-field">
              <span>{copy.accountControl.username}</span>
              <input
                value={accountForm.username}
                onChange={(event) => onAccountFormChange({ username: event.target.value })}
              />
            </label>
            <label className="platform-admin-field">
              <span>{copy.accountControl.displayName}</span>
              <input
                value={accountForm.displayName}
                onChange={(event) => onAccountFormChange({ displayName: event.target.value })}
              />
            </label>
            <label className="platform-admin-field">
              <span>{copy.accountControl.password}</span>
              <input
                type="password"
                value={accountForm.password}
                onChange={(event) => onAccountFormChange({ password: event.target.value })}
              />
            </label>
            {showRoleSelector ? (
              <label className="platform-admin-field">
                <span>{copy.accountControl.role}</span>
                <select
                  value={accountForm.roleCode}
                  onChange={(event) =>
                    onAccountFormChange({ roleCode: event.target.value as RoleCode })
                  }
                >
                  <option value="tenant_admin">{copy.accountControl.createTenantAdmin}</option>
                  <option value="tenant_user">{copy.accountControl.createTenantUser}</option>
                </select>
              </label>
            ) : null}
            <button className="platform-admin-submit" type="submit">
              {showRoleSelector
                ? copy.accountControl.createButton
                : copy.accountControl.createTenantUser}
            </button>
          </form>
        </section>

        <section className="platform-admin-resource-list-panel">
          <div className="platform-admin-list">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="platform-admin-list-item is-static platform-admin-resource-record"
              >
                <div className="platform-admin-resource-record-head">
                  <span className="platform-admin-resource-record-title">{account.displayName}</span>
                  <small>{account.isActive ? copy.common.active : copy.common.inactive}</small>
                </div>
                <div className="platform-admin-resource-record-meta">
                  <small>{account.username}</small>
                  <small>{roleLabel(account.roleCode)}</small>
                </div>
                <div className="platform-admin-resource-record-actions">
                  <button
                    className="platform-admin-secondary-button"
                    type="button"
                    onClick={() => onDeactivate(account.id)}
                  >
                    {copy.accountControl.deactivateButton}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </article>
  );
}
