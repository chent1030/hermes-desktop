import { useEffect, useMemo, useState } from "react";
import type {
  LocalSkillState,
  SkillCatalogItem,
} from "../../../../shared/platform/contracts";
import { useI18n } from "../../components/useI18n";

interface SkillsProps {
  profile?: string;
  catalog?: SkillCatalogItem[];
  localStates?: LocalSkillState[];
  onDownloadSkill?: (skillId: string) => Promise<void>;
}

function getLocalVersionSummary(
  skill: SkillCatalogItem,
  local: LocalSkillState,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (local.status === "outdated" && local.version) {
    return t("skills.localVersionDiff", {
      local: local.version,
      platform: skill.version,
    });
  }

  if (
    (local.status === "installed" || local.status === "downloaded") &&
    local.version
  ) {
    return t("skills.localVersion", { version: local.version });
  }

  return null;
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
  const { t } = useI18n();
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

  const groupedCatalog = useMemo(
    () => ({
      global: mergedCatalog.filter((skill) => skill.scope === "global"),
      tenant: mergedCatalog.filter((skill) => skill.scope === "tenant"),
    }),
    [mergedCatalog],
  );

  const handleDownload = async (skillId: string): Promise<void> => {
    if (onDownloadSkill) {
      await onDownloadSkill(skillId);
      return;
    }

    await window.hermesAPI.downloadSkillPackage(skillId);
  };

  const renderSkillCard = (
    skill: SkillCatalogItem & { local: LocalSkillState },
  ): React.JSX.Element => {
    const localVersionSummary = getLocalVersionSummary(skill, skill.local, t);

    return (
      <div key={skill.id} className="skills-card">
        <div className="skills-card-title">{skill.name}</div>
        <div className="skills-card-meta">
          <span>
            {skill.scope === "global"
              ? t("skills.scopeGlobal")
              : t("skills.scopeTenant")}
          </span>
          <span>{skill.version}</span>
        </div>
        <div className="skills-card-description">{skill.description}</div>
        <div className="skills-card-status">
          {t(
            `skills.status.${
              skill.local.status === "not-downloaded"
                ? "notDownloaded"
                : skill.local.status
            }`,
          )}
        </div>
        {localVersionSummary && (
          <div className="skills-card-local-version">{localVersionSummary}</div>
        )}
        {skill.local.path && (
          <div className="skills-card-local-path">{skill.local.path}</div>
        )}
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => void handleDownload(skill.id)}
        >
          {t("skills.download")}
        </button>
      </div>
    );
  };

  return (
    <div className="skills-container">
      <div className="skills-header">
        <div>
          <h2 className="skills-title">{t("skills.title")}</h2>
          <p className="skills-subtitle">
            {t("skills.subtitle")}
          </p>
        </div>
      </div>

      <div className="skills-sections">
        <section className="skills-section">
          <div className="skills-section-title">{t("skills.sectionGlobal")}</div>
          <div className="skills-grid">
            {groupedCatalog.global.map((skill) => renderSkillCard(skill))}
          </div>
        </section>
        <section className="skills-section">
          <div className="skills-section-title">{t("skills.sectionTenant")}</div>
          <div className="skills-grid">
            {groupedCatalog.tenant.map((skill) => renderSkillCard(skill))}
          </div>
        </section>
      </div>
    </div>
  );
}
