const NAV_ITEMS = ['Mods', 'Map', 'Events', 'Characters', 'Buildings', 'Items']

export function WorkbenchShellSkeleton() {
  return (
    <div className="workbench-shell-skeleton" data-testid="workbench-shell-skeleton" aria-hidden="true">
      <div className="workbench-shell-skeleton-topbar">
        <div className="workbench-shell-skeleton-brand">
          <span className="workbench-shell-skeleton-mark" />
          <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-brand" />
        </div>
        <div className="workbench-shell-skeleton-nav">
          {NAV_ITEMS.map((item) => (
            <span key={item} className="workbench-shell-skeleton-pill" />
          ))}
        </div>
        <div className="workbench-shell-skeleton-actions">
          <span className="workbench-shell-skeleton-dot" />
          <span className="workbench-shell-skeleton-dot" />
          <span className="workbench-shell-skeleton-dot" />
        </div>
      </div>

      <div className="workbench-shell-skeleton-body">
        <div className="workbench-shell-skeleton-panel workbench-shell-skeleton-side">
          <span className="workbench-shell-skeleton-line" />
          <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-wide" />
          <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-mid" />
        </div>
        <div className="workbench-shell-skeleton-panel workbench-shell-skeleton-main">
          <span className="workbench-shell-skeleton-canvas" />
        </div>
        <div className="workbench-shell-skeleton-panel workbench-shell-skeleton-side">
          <span className="workbench-shell-skeleton-line" />
          <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-wide" />
          <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-mid" />
        </div>
      </div>
    </div>
  )
}
