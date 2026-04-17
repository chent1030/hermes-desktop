import { useEffect, useMemo, useState } from "react";
import type {
  LocalSkillState,
  SkillCatalogItem,
} from "../../../../shared/platform/contracts";

interface SkillsProps {
  profile?: string;
  catalog?: SkillCatalogItem[];
  localStates?: LocalSkillState[];
  onDownloadSkill?: (skillId: string) => Promise<void>;
}

function defaultLocalState(skillId: string): LocalSkillState {
  return {
    skillId,
    installed: false,
    version: null,
    status: "not-downloaded",
    path: null,
  };
}

export default function Skills({
  catalog = [],
  localStates,
  onDownloadSkill,
}: SkillsProps): React.JSX.Element {
  const [detectedStates, setDetectedStates] = useState<LocalSkillState[]>(
    localStates || [],
  );

  useEffect(() => {
    if (localStates) {
      setDetectedStates(localStates);
      return;
    }

    let active = true;
    window.hermesAPI.syncSkillInstallations().then((states) => {
      if (active) {
        setDetectedStates(states);
      }
    });

    return () => {
      active = false;
    };
  }, [localStates]);

  const mergedCatalog = useMemo(
    () =>
      catalog.map((skill) => ({
        ...skill,
        local:
          detectedStates.find((state) => state.skillId === skill.id) ||
          defaultLocalState(skill.id),
      })),
    [catalog, detectedStates],
  );

  const handleDownload = async (skillId: string): Promise<void> => {
    if (onDownloadSkill) {
      await onDownloadSkill(skillId);
      return;
    }

    await window.hermesAPI.downloadSkillPackage(skillId);
  };

  return (
    <div className="skills-container">
      <div className="skills-header">
        <div>
          <h2 className="skills-title">Skills</h2>
          <p className="skills-subtitle">
            Browse the platform catalog and your local installation state.
          </p>
        </div>
      </div>

      <div className="skills-grid">
        {mergedCatalog.map((skill) => (
          <div key={skill.id} className="skills-card">
            <div className="skills-card-title">{skill.name}</div>
            <div className="skills-card-meta">
              <span>{skill.scope}</span>
              <span>{skill.version}</span>
            </div>
            <div className="skills-card-description">{skill.description}</div>
            <div className="skills-card-status">{skill.local.status}</div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => void handleDownload(skill.id)}
            >
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
