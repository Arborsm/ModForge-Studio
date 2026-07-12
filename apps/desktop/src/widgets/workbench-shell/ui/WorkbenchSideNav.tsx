import {
  Beaker,
  Castle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GitMerge,
  Home,
  Languages,
  Map,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Users,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { getWorkspaceModeLabel, type CoreWorkspaceMode, type WorkspaceMode } from '@locales/api'
import { useEditorCopy, useLocale, useViewMenuCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { WorkbenchViewRegistration } from '@shared/contracts'

type WorkbenchViewNavigationItem = WorkbenchViewRegistration & {
  active?: boolean
}

const BROWSE_MODES = ['map', 'events', 'characters', 'buildings', 'items'] as const satisfies readonly Exclude<WorkspaceMode, 'mod-i18n'>[]

const ICON_BY_MODE: Record<CoreWorkspaceMode, ComponentType<{ className?: string }>> = {
  map: Map,
  events: GitMerge,
  characters: Users,
  buildings: Castle,
  items: Package,
}

const REGISTERED_VIEW_ICON = { package: Package, languages: Languages, beaker: Beaker } as const

export type WorkbenchSideNavProps = {
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
  onResetLayout: () => void
  workbenchRoute: 'home' | 'workspace'
  workspaceMode: WorkspaceMode
  workspaceViewMode: 'edit' | 'preview'
  registeredWorkbenchViewId: string | null
  devViews?: readonly WorkbenchViewNavigationItem[]
  toolViews?: readonly WorkbenchViewNavigationItem[]
  onHomeOpen: () => void
  onBrowseOpen: (mode: WorkspaceMode) => void
  sectionState: { browseOpen: boolean; toolsOpen: boolean; devOpen: boolean }
  onSectionStateChange: (state: { browseOpen: boolean; toolsOpen: boolean; devOpen: boolean }) => void
  onDevViewOpen?: (viewId: string) => void
}

/**
 * Expandable workbench left navigation: home, browse domains, tools, and dev views.
 */
export default function WorkbenchSideNav({
  collapsed,
  onCollapsedChange,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onResetLayout,
  workbenchRoute,
  workspaceMode,
  workspaceViewMode: _workspaceViewMode,
  registeredWorkbenchViewId,
  devViews = [],
  toolViews = [],
  onHomeOpen,
  onBrowseOpen,
  sectionState,
  onSectionStateChange,
  onDevViewOpen,
}: WorkbenchSideNavProps) {
  const copy = useEditorCopy()
  const locale = useLocale()
  const navCopy = copy.workbenchNavigation
  const viewMenuCopy = useViewMenuCopy()
  const { browseOpen, toolsOpen, devOpen } = sectionState

  const homeActive = workbenchRoute === 'home'
  const workspaceActive = workbenchRoute === 'workspace' && !registeredWorkbenchViewId
  const activeDevViewId = registeredWorkbenchViewId

  return (
    <aside
      className={cx('workbench-side-nav', collapsed && 'workbench-side-nav-collapsed')}
      data-collapsed={collapsed ? 'true' : 'false'}
      role="navigation"
      aria-label={navCopy.shellNavLabel}
    >
      <div className="workbench-side-nav-head">
        {!collapsed ? (
          <div className="workbench-side-nav-head-tools" role="group" aria-label={navCopy.shellNavLabel}>
            <button
              type="button"
              className="workbench-side-nav-tool"
              aria-label={navCopy.shellHistoryBack}
              title={navCopy.shellHistoryBack}
              disabled={!canGoBack}
              onClick={onGoBack}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="workbench-side-nav-tool"
              aria-label={navCopy.shellHistoryForward}
              title={navCopy.shellHistoryForward}
              disabled={!canGoForward}
              onClick={onGoForward}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="workbench-side-nav-tool"
              aria-label={viewMenuCopy.resetLabel}
              title={viewMenuCopy.resetLabel}
              onClick={onResetLayout}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="workbench-side-nav-tool workbench-side-nav-toggle"
          aria-label={collapsed ? navCopy.shellNavExpand : navCopy.shellNavCollapse}
          title={collapsed ? navCopy.shellNavExpand : navCopy.shellNavCollapse}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      <div className="workbench-side-nav-scroll">
        <div className="workbench-side-nav-section" data-open="true">
          <button
            type="button"
            className={cx('workbench-side-nav-item', homeActive && 'is-current')}
            data-tip={navCopy.home}
            aria-current={homeActive ? 'page' : undefined}
            onClick={onHomeOpen}
          >
            <span className="workbench-side-nav-ico" aria-hidden="true">
              <Home className="h-[18px] w-[18px]" />
            </span>
            <span className="workbench-side-nav-label">{navCopy.home}</span>
          </button>
        </div>

        <div className="workbench-side-nav-section" data-section="browse" data-open={browseOpen ? 'true' : 'false'}>
          <button
            type="button"
            className="workbench-side-nav-section-hd"
            aria-expanded={browseOpen}
            onClick={() => onSectionStateChange({ ...sectionState, browseOpen: !browseOpen })}
          >
            <span className="workbench-side-nav-section-label">{navCopy.shellNavBrowseGroup}</span>
            <ChevronDown className={cx('workbench-side-nav-chev', !browseOpen && 'is-collapsed')} aria-hidden="true" />
          </button>
          <div className="workbench-side-nav-section-bd">
            {BROWSE_MODES.map((mode) => {
              const Icon = ICON_BY_MODE[mode]
              const label = getWorkspaceModeLabel(locale, copy, mode)
              const active = workspaceActive && workspaceMode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  className={cx('workbench-side-nav-item', active && 'is-current')}
                  data-tip={label}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onBrowseOpen(mode)}
                >
                  <span className="workbench-side-nav-ico" aria-hidden="true">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="workbench-side-nav-label">{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="workbench-side-nav-section" data-section="tools" data-open={toolsOpen ? 'true' : 'false'}>
          <button
            type="button"
            className="workbench-side-nav-section-hd"
            aria-expanded={toolsOpen}
            onClick={() => onSectionStateChange({ ...sectionState, toolsOpen: !toolsOpen })}
          >
            <span className="workbench-side-nav-section-label">{navCopy.shellNavToolsGroup}</span>
            <ChevronDown className={cx('workbench-side-nav-chev', !toolsOpen && 'is-collapsed')} aria-hidden="true" />
          </button>
          <div className="workbench-side-nav-section-bd">
            {toolViews.map((view) => {
              const workspaceToolMode = view.activation.kind === 'workspace' ? view.activation.workspaceMode : null
              const label =
                workspaceToolMode === 'mod-browser' || workspaceToolMode === 'mod-i18n'
                  ? getWorkspaceModeLabel(locale, copy, workspaceToolMode)
                  : view.viewId === 'i18n-generator'
                    ? copy.i18nGenerator.generatorTitle
                    : view.title
              const Icon = REGISTERED_VIEW_ICON[view.navigationIcon ?? 'beaker']
              return (
                <button
                  key={view.viewId}
                  type="button"
                  className={cx('workbench-side-nav-item', view.active && 'is-current')}
                  data-tip={label}
                  aria-current={view.active ? 'page' : undefined}
                  onClick={() => {
                    onSectionStateChange({ ...sectionState, toolsOpen: true })
                    onDevViewOpen?.(view.viewId)
                  }}
                >
                  <span className="workbench-side-nav-ico" aria-hidden="true">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="workbench-side-nav-label">{label}</span>
                  <span className="workbench-side-nav-tag">Tool</span>
                </button>
              )
            })}
          </div>
        </div>

        {devViews.length ? (
          <div className="workbench-side-nav-section" data-section="dev" data-open={devOpen ? 'true' : 'false'}>
            <button
              type="button"
              className="workbench-side-nav-section-hd"
              aria-expanded={devOpen}
              onClick={() => onSectionStateChange({ ...sectionState, devOpen: !devOpen })}
            >
              <span className="workbench-side-nav-section-label">{navCopy.shellNavDevGroup}</span>
              <ChevronDown className={cx('workbench-side-nav-chev', !devOpen && 'is-collapsed')} aria-hidden="true" />
            </button>
            <div className="workbench-side-nav-section-bd">
              {devViews.map((view) => {
                const active = activeDevViewId === view.viewId || Boolean(view.active)
                return (
                  <button
                    key={view.viewId}
                    type="button"
                    className={cx('workbench-side-nav-item', active && 'is-current')}
                    data-tip={view.title}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      onSectionStateChange({ ...sectionState, devOpen: true })
                      onDevViewOpen?.(view.viewId)
                    }}
                  >
                    <span className="workbench-side-nav-ico" aria-hidden="true">
                      <Beaker className="h-[18px] w-[18px]" />
                    </span>
                    <span className="workbench-side-nav-label">{view.title}</span>
                    <span className="workbench-side-nav-tag">dev</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
