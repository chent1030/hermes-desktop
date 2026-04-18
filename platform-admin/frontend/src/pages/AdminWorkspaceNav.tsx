import type { WorkspaceSection } from "../adminTypes";

interface NavItem {
  key: WorkspaceSection;
  label: string;
}

interface AdminWorkspaceNavProps {
  title: string;
  items: NavItem[];
  activeSection: WorkspaceSection;
  onChange: (section: WorkspaceSection) => void;
}

export function AdminWorkspaceNav({
  title,
  items,
  activeSection,
  onChange,
}: AdminWorkspaceNavProps): React.JSX.Element {
  return (
    <div className="platform-admin-nav">
      <p className="platform-admin-nav-title">{title}</p>
      <span className="platform-admin-nav-count">{items.length}</span>
      <div className="platform-admin-nav-grid">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`platform-admin-nav-item${activeSection === item.key ? " is-active" : ""}`}
          >
            <span className="platform-admin-nav-item-dot" aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
