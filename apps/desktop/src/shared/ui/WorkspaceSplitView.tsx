/** @file Two/three-column workspace split layout with optional toolbar, empty state, and right detail panel. */

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cx } from '@shared/lib/helper'

export type WorkspaceSplitViewEmptyState = {
  icon: ReactNode
  title: string
  hint: string
  action?: ReactNode
}

export type WorkspaceSplitViewProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Left column content; the column body scrolls as a whole, use sticky for fixed headers. */
  sidebar: ReactNode
  /** Main content; renders the emptyState hint when absent. */
  children?: ReactNode
  /** Fixed top toolbar for the main content (search/filter/add controls), rendered above the main content. */
  mainToolbar?: ReactNode
  /** Optional right detail panel; shown when provided, collapses to no space when empty. */
  rightPanel?: ReactNode
  /** Hint state shown when the main content has no children. */
  emptyState?: WorkspaceSplitViewEmptyState
  /** Accessible label for the sidebar landmark. */
  sidebarLabel?: string
  /** Accessible label for the right panel landmark. */
  rightPanelLabel?: string
  /** Sidebar width, defaults to 20rem. */
  sidebarWidth?: string
  /** Right panel width, defaults to 18rem. */
  rightPanelWidth?: string
  sidebarClassName?: string
  mainClassName?: string
  rightPanelClassName?: string
  /** Main content canvas grid background toggle (for editor views); off by default for directory/list pages. */
  canvas?: boolean
}

/**
 * Workspace two/three-column layout control: a plain left sidebar, a center main content area, and an optional right detail panel.
 * Renders children directly when there is content; otherwise renders a centered emptyState.
 */
export function WorkspaceSplitView({
  sidebar,
  children,
  mainToolbar,
  rightPanel,
  emptyState,
  sidebarLabel,
  rightPanelLabel,
  sidebarWidth,
  rightPanelWidth,
  sidebarClassName,
  mainClassName,
  rightPanelClassName,
  canvas,
  className,
  style,
  ...rest
}: WorkspaceSplitViewProps) {
  const hasRightPanel = rightPanel != null
  const rootStyle = {
    ...style,
    ...(sidebarWidth ? { '--workspace-split-sidebar-width': sidebarWidth } : {}),
    ...(rightPanelWidth ? { '--workspace-split-right-panel-width': rightPanelWidth } : {}),
  } as CSSProperties

  return (
    <div className={cx('workspace-split-view', hasRightPanel && 'has-right-panel', className)} style={rootStyle} {...rest}>
      <aside className={cx('workspace-split-view-sidebar', sidebarClassName)} aria-label={sidebarLabel}>
        {sidebar}
      </aside>
      <div className={cx('workspace-split-view-main', canvas && 'is-canvas', mainClassName)}>
        {mainToolbar ? <div className="workspace-split-view-toolbar">{mainToolbar}</div> : null}
        {children ??
          (emptyState ? (
            <div className="workspace-split-view-empty">
              <span className="workspace-split-view-empty-icon" aria-hidden="true">
                {emptyState.icon}
              </span>
              <strong className="workspace-split-view-empty-title">{emptyState.title}</strong>
              <p className="workspace-split-view-empty-hint">{emptyState.hint}</p>
              {emptyState.action}
            </div>
          ) : null)}
      </div>
      {hasRightPanel ? (
        <aside className={cx('workspace-split-view-right-panel', rightPanelClassName)} aria-label={rightPanelLabel}>
          {rightPanel}
        </aside>
      ) : null}
    </div>
  )
}
