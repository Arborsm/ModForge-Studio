import { Beaker, Castle, GitMerge, Home, Languages, Library, Map, Package, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { getWorkspaceModeLabel, type WorkspaceMode } from '@locales/api'
import { useEditorCopy, useLocale } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { WorkbenchViewRegistration } from '@shared/contracts'
import { getRecentPageKey, type LaunchpadRecentPage } from '../model/useWorkbenchLaunchpadRecentPages'

type DevWorkbenchViewNavigationItem = WorkbenchViewRegistration & {
  active?: boolean
}

const ICON_BY_MODE: Record<WorkspaceMode, ComponentType<{ className?: string }>> = {
  mods: Library,
  map: Map,
  events: GitMerge,
  characters: Users,
  buildings: Castle,
  items: Package,
  'mod-i18n': Languages,
}

type WorkbenchLaunchpadDockProps = {
  homeActive: boolean
  dockPlacement?: 'floating' | 'titlebar'
  workspaceMode: WorkspaceMode
  workspaceViewMode: 'edit' | 'preview'
  recentPages: LaunchpadRecentPage[]
  devViews?: readonly DevWorkbenchViewNavigationItem[]
  onToggleHome: () => void
  onRootWorkspaceOpen: (mode: WorkspaceMode) => void
  onProjectWorkspaceOpen: (mode: WorkspaceMode) => void
  onOpenProjectPage: () => void
  onDevViewOpen?: (viewId: string) => void
}

export default function WorkbenchLaunchpadDock({
  homeActive,
  dockPlacement = 'floating',
  workspaceMode,
  workspaceViewMode,
  recentPages,
  devViews = [],
  onToggleHome,
  onRootWorkspaceOpen,
  onProjectWorkspaceOpen,
  onOpenProjectPage,
  onDevViewOpen,
}: WorkbenchLaunchpadDockProps) {
  const copy = useEditorCopy()
  const locale = useLocale()
  const navCopy = copy.workbenchNavigation
  const activeDevView = devViews.find((view) => view.active)
  const visibleRecentPages = recentPages.slice(0, 4)

  return (
    <nav
      className={cx('workbench-quick-dock', dockPlacement === 'titlebar' && 'workbench-quick-dock-titlebar')}
      aria-label={navCopy.recentPages}
    >
      <button
        type="button"
        className={cx('workbench-dock-item workbench-dock-home', homeActive && 'workbench-dock-item-active')}
        aria-label={navCopy.home}
        aria-current={homeActive ? 'page' : undefined}
        title={navCopy.home}
        onClick={onToggleHome}
      >
        <Home className="h-4 w-4" aria-hidden="true" />
      </button>
      {visibleRecentPages.length ? <span className="workbench-dock-separator" aria-hidden="true" /> : null}
      {visibleRecentPages.map((page) => {
        const devView = page.kind === 'dev' ? devViews.find((view) => view.viewId === page.viewId) : null
        const Icon = page.kind === 'dev' ? Beaker : ICON_BY_MODE[page.mode]
        const modeLabel =
          page.kind === 'dev'
            ? (devView?.title ?? page.viewId)
            : page.mode === 'mods'
              ? navCopy.rootModeLabels.mods
              : getWorkspaceModeLabel(locale, copy, page.mode)
        const label =
          page.kind === 'dev'
            ? modeLabel
            : page.kind === 'project' && page.mode !== 'mods'
              ? `${navCopy.projectChildren}: ${modeLabel}`
              : modeLabel
        const active =
          page.kind === 'dev'
            ? Boolean(devView?.active)
            : !activeDevView && workspaceMode === page.mode && workspaceViewMode === (page.kind === 'root' ? 'preview' : 'edit')

        return (
          <button
            key={getRecentPageKey(page)}
            type="button"
            className={cx('workbench-dock-item', active && 'workbench-dock-item-active')}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            title={label}
            onClick={() => {
              if (page.kind === 'dev') {
                onDevViewOpen?.(page.viewId)
                return
              }

              if (page.kind === 'root') {
                onRootWorkspaceOpen(page.mode)
                return
              }

              if (page.mode === 'mods') {
                onOpenProjectPage()
                return
              }

              onProjectWorkspaceOpen(page.mode)
            }}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        )
      })}
    </nav>
  )
}

export type { WorkbenchLaunchpadDockProps }
