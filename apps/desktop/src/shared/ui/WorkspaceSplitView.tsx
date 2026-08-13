import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cx } from '@shared/lib/helper'

export type WorkspaceSplitViewEmptyState = {
  icon: ReactNode
  title: string
  hint: string
  action?: ReactNode
}

export type WorkspaceSplitViewProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** 左栏内容；栏体整体滚动，需要固定头部时用 sticky 自行处理。 */
  sidebar: ReactNode
  /** 主内容；缺省时渲染 emptyState 提示。 */
  children?: ReactNode
  /** 主内容固定顶栏（搜索/筛选/新增等工具控件），渲染在主内容上方。 */
  mainToolbar?: ReactNode
  /** 右侧可选详情栏；有内容时显示，为空时折叠不占位。 */
  rightPanel?: ReactNode
  /** 主内容无内容时的提示态。 */
  emptyState?: WorkspaceSplitViewEmptyState
  /** 侧栏 landmark 的无障碍标签。 */
  sidebarLabel?: string
  /** 右栏 landmark 的无障碍标签。 */
  rightPanelLabel?: string
  /** 侧栏宽度，默认 20rem。 */
  sidebarWidth?: string
  /** 右栏宽度，默认 18rem。 */
  rightPanelWidth?: string
  sidebarClassName?: string
  mainClassName?: string
  rightPanelClassName?: string
  /** 主内容是否显示画布网格背景（编辑器视图用）；目录/列表页默认不显示。 */
  canvas?: boolean
}

/**
 * 工作台二/三栏布局控件：左侧纯白侧栏，中间主内容区，右侧可选详情栏。
 * 有内容时右侧直接渲染 children；无内容时渲染 emptyState 居中空态。
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
