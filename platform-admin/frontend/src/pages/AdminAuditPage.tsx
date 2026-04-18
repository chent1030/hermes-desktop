interface AdminAuditPageProps {
  titleLabel: string;
  title: string;
  filters: React.JSX.Element;
  summary: React.JSX.Element;
  hint?: string | null;
  events: React.JSX.Element[];
  loadMoreVisible: boolean;
  loadMoreLabel: string;
  onLoadMore: () => void;
  disabled?: boolean;
}

export function AdminAuditPage({
  titleLabel,
  title,
  filters,
  summary,
  hint,
  events,
  loadMoreVisible,
  loadMoreLabel,
  onLoadMore,
  disabled,
}: AdminAuditPageProps): React.JSX.Element {
  return (
    <article className="platform-admin-card platform-admin-stack-card">
      <p className="platform-admin-section-label">{titleLabel}</p>
      <h3>{title}</h3>
      {filters}
      {summary}
      {hint ? <p className="platform-admin-panel-note">{hint}</p> : null}
      <div className="platform-admin-list">{events}</div>
      {loadMoreVisible ? (
        <button className="platform-admin-secondary-button" type="button" onClick={onLoadMore} disabled={disabled}>
          {loadMoreLabel}
        </button>
      ) : null}
    </article>
  );
}
