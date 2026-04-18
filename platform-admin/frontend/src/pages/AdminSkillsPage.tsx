import type { AdminCopy } from "../adminI18n";
import type { SkillCatalogRecord } from "../adminTypes";

interface SkillForm {
  name: string;
  version: string;
  description: string;
  downloadUrl: string;
}

interface AdminSkillsPageProps {
  copy: AdminCopy;
  title: string;
  showScopeSelector: boolean;
  skillScope: "global" | "tenant";
  canSelectTenantScope: boolean;
  onSelectScope: (scope: "global" | "tenant") => void;
  skillForm: SkillForm;
  onSkillFormChange: (patch: Partial<SkillForm>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  skillCatalog: SkillCatalogRecord[];
  onDeactivate: (skillId: string) => void;
}

export function AdminSkillsPage({
  copy,
  title,
  showScopeSelector,
  skillScope,
  canSelectTenantScope,
  onSelectScope,
  skillForm,
  onSkillFormChange,
  onSubmit,
  skillCatalog,
  onDeactivate,
}: AdminSkillsPageProps): React.JSX.Element {
  return (
    <article className="platform-admin-card platform-admin-stack-card platform-admin-resource-page">
      <div className="platform-admin-resource-head">
        <div>
          <p className="platform-admin-section-label">
            {showScopeSelector ? copy.skillControl.section : copy.skillControl.tenantSection}
          </p>
          <h3>{title}</h3>
        </div>
        <span className="platform-admin-resource-count">{skillCatalog.length}</span>
      </div>

      <div className="platform-admin-resource-layout">
        <section className="platform-admin-resource-editor">
          {showScopeSelector ? (
            <label className="platform-admin-field">
              <span>{copy.skillControl.scope}</span>
              <select
                value={skillScope}
                onChange={(event) => onSelectScope(event.target.value as "global" | "tenant")}
              >
                <option value="global">{copy.skillControl.globalSkills}</option>
                {canSelectTenantScope ? (
                  <option value="tenant">{copy.skillControl.tenantSkills}</option>
                ) : null}
              </select>
            </label>
          ) : null}
          <form className="platform-admin-form" onSubmit={onSubmit}>
            <label className="platform-admin-field">
              <span>{copy.skillControl.name}</span>
              <input
                value={skillForm.name}
                onChange={(event) => onSkillFormChange({ name: event.target.value })}
              />
            </label>
            <label className="platform-admin-field">
              <span>{copy.skillControl.version}</span>
              <input
                value={skillForm.version}
                onChange={(event) => onSkillFormChange({ version: event.target.value })}
              />
            </label>
            <label className="platform-admin-field">
              <span>{copy.skillControl.description}</span>
              <input
                value={skillForm.description}
                onChange={(event) => onSkillFormChange({ description: event.target.value })}
              />
            </label>
            <label className="platform-admin-field">
              <span>{copy.skillControl.downloadUrl}</span>
              <input
                value={skillForm.downloadUrl}
                onChange={(event) => onSkillFormChange({ downloadUrl: event.target.value })}
              />
            </label>
            <button className="platform-admin-submit" type="submit">
              {copy.skillControl.createButton}
            </button>
          </form>
        </section>

        <section className="platform-admin-resource-list-panel">
          <div className="platform-admin-list">
            {skillCatalog.map((item) => (
              <div
                key={item.id}
                className="platform-admin-list-item is-static platform-admin-resource-record"
              >
                <div className="platform-admin-resource-record-head">
                  <span className="platform-admin-resource-record-title">{item.name}</span>
                  <small>{item.isActive ? copy.common.active : copy.common.inactive}</small>
                </div>
                <div className="platform-admin-resource-record-meta">
                  <small>{item.version}</small>
                  <small>
                    {item.scopeType === "global" ? copy.common.global : copy.common.tenant}
                  </small>
                </div>
                <div className="platform-admin-resource-record-actions">
                  <button
                    className="platform-admin-secondary-button"
                    type="button"
                    onClick={() => onDeactivate(item.id)}
                  >
                    {copy.skillControl.deactivateButton}
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
