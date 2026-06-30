const NAV_ITEMS = Array.from({ length: 6 }, (_, index) => `nav:${index}`)
const GLOBAL_APP_ITEMS = Array.from({ length: 6 }, (_, index) => `global:${index}`)
const MAKER_APP_ITEMS = Array.from({ length: 3 }, (_, index) => `maker:${index}`)
const PROJECT_ITEMS = Array.from({ length: 3 }, (_, index) => `project:${index}`)
const METRIC_ITEMS = Array.from({ length: 3 }, (_, index) => `metric:${index}`)

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

      <div className="workbench-shell-skeleton-home">
        <div className="workbench-shell-skeleton-search">
          <span className="workbench-shell-skeleton-search-icon" />
          <span className="workbench-shell-skeleton-line workbench-shell-skeleton-search-line" />
          <span className="workbench-shell-skeleton-keycap" />
        </div>

        <div className="workbench-shell-skeleton-hero">
          <div className="workbench-shell-skeleton-current-card">
            <span className="workbench-shell-skeleton-cover" />
            <div className="workbench-shell-skeleton-current-copy">
              <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-short" />
              <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-title" />
              <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-wide" />
            </div>
            <div className="workbench-shell-skeleton-makerbar">
              {MAKER_APP_ITEMS.map((item) => (
                <span key={item} className="workbench-shell-skeleton-maker-chip">
                  <span className="workbench-shell-skeleton-maker-icon" />
                  <span className="workbench-shell-skeleton-line" />
                </span>
              ))}
            </div>
          </div>

          <div className="workbench-shell-skeleton-metrics">
            {METRIC_ITEMS.map((item) => (
              <span key={item} className="workbench-shell-skeleton-metric">
                <span className="workbench-shell-skeleton-metric-icon" />
                <span className="workbench-shell-skeleton-line" />
              </span>
            ))}
          </div>
        </div>

        <div className="workbench-shell-skeleton-section">
          <div className="workbench-shell-skeleton-section-head">
            <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-title" />
            <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-mid" />
          </div>
          <div className="workbench-shell-skeleton-app-grid">
            {GLOBAL_APP_ITEMS.map((item) => (
              <span key={item} className="workbench-shell-skeleton-app-card">
                <span className="workbench-shell-skeleton-app-icon" />
                <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-wide" />
                <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-mid" />
              </span>
            ))}
          </div>
        </div>

        <div className="workbench-shell-skeleton-library">
          <div className="workbench-shell-skeleton-library-head">
            <div>
              <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-title" />
              <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-mid" />
            </div>
            <span className="workbench-shell-skeleton-library-action" />
          </div>
          <div className="workbench-shell-skeleton-project-list">
            {PROJECT_ITEMS.map((item) => (
              <span key={item} className="workbench-shell-skeleton-project-row">
                <span className="workbench-shell-skeleton-project-cover" />
                <span className="workbench-shell-skeleton-project-copy">
                  <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-wide" />
                  <span className="workbench-shell-skeleton-line workbench-shell-skeleton-line-mid" />
                </span>
                <span className="workbench-shell-skeleton-project-pill" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
