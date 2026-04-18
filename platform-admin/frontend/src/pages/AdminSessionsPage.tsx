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
    <article className="platform-admin-card platform-admin-stack-card">
      <p className="platform-admin-section-label">{titleLabel}</p>
      <h3>{title}</h3>
      {filters}
      {hint ? <p className="platform-admin-panel-note">{hint}</p> : null}
      <div className="platform-admin-list">{sessions}</div>
      {loadMoreVisible ? (
        <button className="platform-admin-secondary-button" type="button" onClick={onLoadMore} disabled={disabled}>
          {loadMoreLabel}
        </button>
      ) : null}
    </article>
  );
}
