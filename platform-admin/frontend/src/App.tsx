import "./app.css";

const modules = [
  {
    title: "Tenants & RBAC",
    description: "Manage tenants, users, roles, and permission boundaries.",
  },
  {
    title: "Config Center",
    description: "Control model profiles, tenant scopes, and client delivery settings.",
  },
  {
    title: "Skill Hub",
    description: "Prepare global and tenant skill registries for repository-based distribution.",
  },
  {
    title: "Audit Center",
    description: "Collect login, runtime, and compliance events with tenant-level visibility.",
  },
] as const;

export default function App(): React.JSX.Element {
  return (
    <main className="platform-admin-app">
      <section className="platform-admin-hero">
        <p className="platform-admin-eyebrow">Stage 1 Foundation</p>
        <h1>Hermes Platform Admin</h1>
        <p className="platform-admin-description">
          Production-oriented platform foundation for tenant management, model delivery,
          skill distribution, and compliance audit.
        </p>
      </section>

      <section className="platform-admin-grid" aria-label="phase-1-modules">
        {modules.map((module) => (
          <article key={module.title} className="platform-admin-card">
            <h2>{module.title}</h2>
            <p>{module.description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
