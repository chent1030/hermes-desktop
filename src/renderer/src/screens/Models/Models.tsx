import { useI18n } from "../../components/useI18n";
import { usePlatform } from "../../platform/usePlatform";

export default function Models(): React.JSX.Element {
  const { workspace, setSelectedModel } = usePlatform();
  const { t } = useI18n();

  return (
    <div className="settings-container">
      <h1 className="settings-header">{t("models.title")}</h1>
      <p className="models-subtitle">
        {t("models.subtitle")}
      </p>

      <div className="models-grid">
        {workspace?.models.map((model) => (
          <button
            key={model.id}
            className={`models-card ${workspace.selectedModelId === model.id ? "active" : ""}`}
            onClick={() => void setSelectedModel(model.id)}
          >
            <div className="models-card-header">
              <div className="models-card-name">{model.label}</div>
              {model.isDefault && (
                <span className="models-card-provider">{t("models.default")}</span>
              )}
            </div>
            <div className="models-card-model">{model.model}</div>
            {model.baseUrl && <div className="models-card-url">{model.baseUrl}</div>}
          </button>
        ))}
        {workspace && workspace.models.length === 0 && (
          <div className="models-empty">{t("models.empty")}</div>
        )}
      </div>
    </div>
  );
}
