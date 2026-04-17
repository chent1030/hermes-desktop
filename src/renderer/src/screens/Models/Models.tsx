import { usePlatform } from "../../platform/usePlatform";

export default function Models(): React.JSX.Element {
  const { workspace, setSelectedModel } = usePlatform();

  return (
    <div className="settings-container">
      <h1 className="settings-header">Models</h1>
      <p className="models-subtitle">
        View and switch the models authorized by the platform.
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
                <span className="models-card-provider">Default</span>
              )}
            </div>
            <div className="models-card-model">{model.model}</div>
            {model.baseUrl && <div className="models-card-url">{model.baseUrl}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
