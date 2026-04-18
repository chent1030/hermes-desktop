import type { AdminCopy } from "../adminI18n";
import type { ModelProfileRecord } from "../adminTypes";

interface ModelForm {
  provider: string;
  model: string;
  label: string;
  baseUrl: string;
  isDefault: boolean;
}

interface AdminModelsPageProps {
  copy: AdminCopy;
  title: string;
  showScopeSelector: boolean;
  modelScope: "global" | "tenant";
  canSelectTenantScope: boolean;
  onSelectScope: (scope: "global" | "tenant") => void;
  modelForm: ModelForm;
  onModelFormChange: (patch: Partial<ModelForm>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  modelProfiles: ModelProfileRecord[];
  onDeactivate: (modelId: string) => void;
}

export function AdminModelsPage({
  copy,
  title,
  showScopeSelector,
  modelScope,
  canSelectTenantScope,
  onSelectScope,
  modelForm,
  onModelFormChange,
  onSubmit,
  modelProfiles,
  onDeactivate,
}: AdminModelsPageProps): React.JSX.Element {
  return (
    <article className="platform-admin-card platform-admin-stack-card platform-admin-resource-page">
      <div className="platform-admin-resource-head">
        <div>
          <p className="platform-admin-section-label">
            {showScopeSelector ? copy.modelControl.section : copy.modelControl.tenantSection}
          </p>
          <h3>{title}</h3>
        </div>
        <span className="platform-admin-resource-count">{modelProfiles.length}</span>
      </div>

      <div className="platform-admin-resource-layout">
        <section className="platform-admin-resource-editor">
          {showScopeSelector ? (
            <label className="platform-admin-field">
              <span>{copy.modelControl.scope}</span>
              <select
                value={modelScope}
                onChange={(event) => onSelectScope(event.target.value as "global" | "tenant")}
              >
                <option value="global">{copy.modelControl.globalModels}</option>
                {canSelectTenantScope ? (
                  <option value="tenant">{copy.modelControl.tenantModels}</option>
                ) : null}
              </select>
            </label>
          ) : null}
          <form className="platform-admin-form" onSubmit={onSubmit}>
            <label className="platform-admin-field">
              <span>{copy.modelControl.provider}</span>
              <input
                value={modelForm.provider}
                onChange={(event) => onModelFormChange({ provider: event.target.value })}
              />
            </label>
            <label className="platform-admin-field">
              <span>{copy.modelControl.modelId}</span>
              <input
                value={modelForm.model}
                onChange={(event) => onModelFormChange({ model: event.target.value })}
              />
            </label>
            <label className="platform-admin-field">
              <span>{copy.modelControl.label}</span>
              <input
                value={modelForm.label}
                onChange={(event) => onModelFormChange({ label: event.target.value })}
              />
            </label>
            <label className="platform-admin-field">
              <span>{copy.modelControl.baseUrl}</span>
              <input
                value={modelForm.baseUrl}
                onChange={(event) => onModelFormChange({ baseUrl: event.target.value })}
              />
            </label>
            <label className="platform-admin-field">
              <span>{copy.modelControl.defaultFlag}</span>
              <select
                value={modelForm.isDefault ? "true" : "false"}
                onChange={(event) =>
                  onModelFormChange({ isDefault: event.target.value === "true" })
                }
              >
                <option value="true">{copy.modelControl.defaultModel}</option>
                <option value="false">{copy.modelControl.optionalModel}</option>
              </select>
            </label>
            <button className="platform-admin-submit" type="submit">
              {copy.modelControl.createButton}
            </button>
          </form>
        </section>

        <section className="platform-admin-resource-list-panel">
          <div className="platform-admin-list">
            {modelProfiles.map((item) => (
              <div
                key={item.id}
                className="platform-admin-list-item is-static platform-admin-resource-record"
              >
                <div className="platform-admin-resource-record-head">
                  <span className="platform-admin-resource-record-title">{item.label}</span>
                  <small>{item.isActive ? copy.common.active : copy.common.inactive}</small>
                </div>
                <div className="platform-admin-resource-record-meta">
                  <small>{item.provider}</small>
                  <small>{item.model}</small>
                  <small>{item.isDefault ? copy.common.default : copy.common.optional}</small>
                </div>
                <div className="platform-admin-resource-record-actions">
                  <button
                    className="platform-admin-secondary-button"
                    type="button"
                    onClick={() => onDeactivate(item.id)}
                  >
                    {copy.modelControl.deactivateButton}
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
