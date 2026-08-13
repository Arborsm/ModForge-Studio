import {
  Beaker,
  BookOpen,
  BookOpenCheck,
  Bug,
  CalendarClock,
  Castle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitMerge,
  Home,
  Languages,
  Images,
  LockKeyhole,
  Mail,
  Map,
  MessagesSquare,
  Music,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Settings,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEditorCopy, useViewMenuCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { WorkbenchLocation, WorkbenchModuleRegistration, WorkbenchNavigationSection } from '@shared/contracts'

const ICONS = {
  map: Map,
  events: GitMerge,
  characters: Users,
  buildings: Castle,
  items: Package,
  audio: Music,
  package: Package,
  languages: Languages,
  files: FileText,
  beaker: Beaker,
  'book-open-check': BookOpenCheck,
  'book-open': BookOpen,
  dialogue: MessagesSquare,
  schedule: CalendarClock,
  mail: Mail,
  bug: Bug,
  settings: Settings,
  images: Images,
} as const

export type WorkbenchSideNavSectionState = {
  browseOpen: boolean
  authoringOpen: boolean
  translationOpen: boolean
  toolsOpen: boolean
  devOpen: boolean
}

export type WorkbenchSideNavProps = {
  collapsed: boolean
  hasActiveProject: boolean
  onCollapsedChange: (collapsed: boolean) => void
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
  onResetLayout: () => void
  location: WorkbenchLocation
  modules: readonly WorkbenchModuleRegistration[]
  onHomeOpen: () => void
  onModuleOpen: (moduleId: string) => void
  sectionState: WorkbenchSideNavSectionState
  onSectionStateChange: (state: WorkbenchSideNavSectionState) => void
  /** Extra head tools (e.g. the global expert-mode toggle) rendered beside history. */
  headTools?: ReactNode
}

const SECTIONS: readonly WorkbenchNavigationSection[] = ['authoring', 'browse', 'translation', 'tools', 'development']

/** Registry-driven workbench navigation for home and every module section. */
export default function WorkbenchSideNav({
  collapsed,
  hasActiveProject,
  onCollapsedChange,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onResetLayout,
  location,
  modules,
  onHomeOpen,
  onModuleOpen,
  sectionState,
  onSectionStateChange,
  headTools,
}: WorkbenchSideNavProps) {
  const navCopy = useEditorCopy().workbenchNavigation
  const viewMenuCopy = useViewMenuCopy()
  const sectionMeta = {
    browse: { label: navCopy.shellNavBrowseGroup, stateKey: 'browseOpen' as const, dataSection: 'browse' },
    authoring: { label: navCopy.shellNavAuthoringGroup, stateKey: 'authoringOpen' as const, dataSection: 'authoring' },
    translation: { label: navCopy.shellNavTranslationGroup, stateKey: 'translationOpen' as const, dataSection: 'translation' },
    tools: { label: navCopy.shellNavToolsGroup, stateKey: 'toolsOpen' as const, dataSection: 'tools' },
    development: { label: navCopy.shellNavDevGroup, stateKey: 'devOpen' as const, dataSection: 'dev' },
  }
  const homeActive = location.kind === 'home'

  return (
    <aside
      className={cx('workbench-side-nav', collapsed && 'workbench-side-nav-collapsed')}
      data-collapsed={collapsed ? 'true' : 'false'}
      data-guide="workbench-nav"
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
            {headTools}
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

        {SECTIONS.map((section) => {
          const meta = sectionMeta[section]
          const entries = modules
            .filter((registration) => registration.navigation.section === section)
            .slice()
            .sort((left, right) => left.navigation.order - right.navigation.order)
          const projectSection = section === 'authoring'
          if (!entries.length) return null
          const open = sectionState[meta.stateKey]
          return (
            <div key={section} className="workbench-side-nav-section" data-section={meta.dataSection} data-open={open ? 'true' : 'false'}>
              <button
                type="button"
                className="workbench-side-nav-section-hd"
                aria-expanded={open}
                onClick={() => onSectionStateChange({ ...sectionState, [meta.stateKey]: !open })}
              >
                <span className="workbench-side-nav-section-label">{meta.label}</span>
                <ChevronDown className={cx('workbench-side-nav-chev', !open && 'is-collapsed')} aria-hidden="true" />
              </button>
              <div className="workbench-side-nav-section-bd">
                {entries.map((registration) => {
                  const Icon = ICONS[registration.navigation.icon]
                  const label = navCopy.moduleLabels[registration.navigation.labelKey]
                  const active = location.kind === 'module' && location.moduleId === registration.id
                  const locked = projectSection && !hasActiveProject
                  return (
                    <button
                      key={registration.id}
                      type="button"
                      className={cx('workbench-side-nav-item', active && 'is-current', locked && 'is-locked')}
                      data-tip={label}
                      aria-current={active ? 'page' : undefined}
                      aria-disabled={locked || undefined}
                      title={locked ? navCopy.shellEditLockedTitle : undefined}
                      onClick={() => (locked ? onHomeOpen() : onModuleOpen(registration.id))}
                    >
                      <span className="workbench-side-nav-ico" aria-hidden="true">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="workbench-side-nav-label">{label}</span>
                      {locked ? <LockKeyhole className="workbench-side-nav-lock" aria-hidden="true" /> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
