function Gateway(): React.JSX.Element {
  return (
    <div className="settings-container">
      <h1 className="settings-header">Gateway</h1>
      <div className="settings-section">
        <div className="settings-section-title">Managed by platform</div>
        <p className="settings-field-hint">
          Gateway controls are no longer available in the desktop client.
        </p>
      </div>
    </div>
  );
}

export default Gateway;
