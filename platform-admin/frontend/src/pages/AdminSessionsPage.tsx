interface AdminSessionsPageProps {
  titleLabel: string;
  title: string;
  filters: React.JSX.Element;
  hint?: string | null;
  sessions: React.JSX.Element[];
  loadMoreVisible: boolean;
  loadMoreLabel: string;
  onLoadMore: () => void;
  disabled?: boolean;
}

export function AdminSessionsPage({
  titleLabel,
  title,
  filters,
  hint,
  sessions,
  loadMoreVisible,
  loadMoreLabel,
  onLoadMore,
  disabled,
}: AdminSessionsPageProps): React.JSX.Element {
  return (
    <article className="platform-admin-card platform-admin-stack-card platform-admin-data-page">
      <div className="platform-admin-data-head">
        <div>
          <p className="platform-admin-section-label">{titleLabel}</p>
          <h3>{title}</h3>
        </div>
        <span className="platform-admin-resource-count">#{sessions.length}</span>
      </div>

      <div className="platform-admin-data-layout">
        <section className="platform-admin-filter-panel">{filters}</section>

        <div className="platform-admin-data-stack">
          {hint ? <p className="platform-admin-data-hint">{hint}</p> : null}

          <section className="platform-admin-data-list-panel">
            <div className="platform-admin-data-list-head">
              <p className="platform-admin-section-label">{titleLabel}</p>
              <span className="platform-admin-resource-count">#{sessions.length}</span>
            </div>
            <div className="platform-admin-list">{sessions}</div>
            {loadMoreVisible ? (
              <div className="platform-admin-data-actions">
                <button
                  className="platform-admin-secondary-button"
                  type="button"
                  onClick={onLoadMore}
                  disabled={disabled}
                >
                  {loadMoreLabel}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </article>
  );
}
