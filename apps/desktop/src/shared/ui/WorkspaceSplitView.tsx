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
  /** 右栏主内容；缺省时渲染 emptyState 提示。 */
  children?: ReactNode
  /** 右栏无内容时的提示态。 */
  emptyState?: WorkspaceSplitViewEmptyState
  /** 侧栏 landmark 的无障碍标签。 */
  sidebarLabel?: string
  /** 侧栏宽度，默认 20rem。 */
  sidebarWidth?: string
  sidebarClassName?: string
  mainClassName?: string
}

/**
 * 工作台二栏布局控件：左侧纯白侧栏（border-right 分隔、整体滚动），右侧网格背景内容区。
 * 有内容时右侧直接渲染 children（单格拉伸、内部自滚动）；无内容时渲染 emptyState 居中空态。
 */
export function WorkspaceSplitView({
  sidebar,
  children,
  emptyState,
  sidebarLabel,
  sidebarWidth,
  sidebarClassName,
  mainClassName,
  className,
  style,
  ...rest
}: WorkspaceSplitViewProps) {
  const rootStyle = sidebarWidth ? ({ ...style, '--workspace-split-sidebar-width': sidebarWidth } as CSSProperties) : style

  return (
    <div className={cx('workspace-split-view', className)} style={rootStyle} {...rest}>
      <aside className={cx('workspace-split-view-sidebar', sidebarClassName)} aria-label={sidebarLabel}>
        {sidebar}
      </aside>
      <div className={cx('workspace-split-view-main', mainClassName)}>
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
    </div>
  )
}
