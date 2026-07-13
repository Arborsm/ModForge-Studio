import type { ComponentProps, RefObject } from 'react'
import TopMenuBar from '@widgets/top-navigation'
import { WorkbenchSideNav } from '@widgets/workbench-shell'
import { WorkbenchHomePage } from './WorkbenchHomePage'
import { WorkbenchModuleHost } from './WorkbenchModuleHost'

type WorkbenchShellProps = {
  rootRef: RefObject<HTMLDivElement | null>
  active: boolean
  interactionLocked: boolean
  topMenu: ComponentProps<typeof TopMenuBar>
  sideNavigation: ComponentProps<typeof WorkbenchSideNav>
  moduleHost: ComponentProps<typeof WorkbenchModuleHost> | null
  homePage: ComponentProps<typeof WorkbenchHomePage> | null
}

/** Owns the Workbench chrome and the single home-or-module content surface. */
export function WorkbenchShell({ rootRef, active, interactionLocked, topMenu, sideNavigation, moduleHost, homePage }: WorkbenchShellProps) {
  return (
    <div ref={rootRef} className={active ? 'flex h-full flex-col' : 'hidden'} aria-busy={interactionLocked} aria-hidden={!active}>
      <TopMenuBar {...topMenu} />
      <div className="workbench-shell-body" data-nav={sideNavigation.collapsed ? 'collapsed' : 'expanded'}>
        <WorkbenchSideNav {...sideNavigation} />
        <div className="workbench-shell-main">
          <div className="relative h-full min-h-0 flex-1 overflow-hidden">
            {moduleHost ? (
              <div className="absolute inset-0 min-h-0 overflow-hidden">
                <WorkbenchModuleHost {...moduleHost} />
              </div>
            ) : null}
            {homePage ? <WorkbenchHomePage {...homePage} /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
