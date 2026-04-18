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
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-2 shadow-sm">
      <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
        {title}
      </p>
      <div className="grid gap-1 md:grid-cols-3 xl:grid-cols-7">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
              activeSection === item.key
                ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20"
                : "bg-slate-50 text-slate-600 hover:bg-brand-50 hover:text-brand-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
