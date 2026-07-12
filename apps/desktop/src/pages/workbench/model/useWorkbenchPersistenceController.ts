import { useEffect, useRef, type RefObject } from 'react'
import type { WorkbenchLocation, WorkbenchModuleRegistration } from '@shared/contracts'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import { resolveWorkbenchLocation } from './useWorkbenchNavigation'

export type WorkbenchSideNavigationState = {
  browseOpen: boolean
  authoringOpen: boolean
  toolsOpen: boolean
  devOpen: boolean
}

type WorkbenchPersistenceControllerOptions = {
  appUiStateReady: boolean
  projectReady: boolean
  hasActiveProject: boolean
  location: WorkbenchLocation
  collapsed: boolean
  sections: WorkbenchSideNavigationState
  navigationInteractedRef: RefObject<boolean>
  sideNavigationInteractedRef: RefObject<boolean>
  getModuleRegistration: (moduleId: string) => WorkbenchModuleRegistration | null
  restoreLocation: (location: WorkbenchLocation) => void
  restoreCollapsed: (collapsed: boolean) => void
  restoreSections: (sections: WorkbenchSideNavigationState) => void
}

/** Hydrates and persists the registry-driven workbench shell location and navigation state. */
export function useWorkbenchPersistenceController({
  appUiStateReady,
  projectReady,
  hasActiveProject,
  location,
  collapsed,
  sections,
  navigationInteractedRef,
  sideNavigationInteractedRef,
  getModuleRegistration,
  restoreLocation,
  restoreCollapsed,
  restoreSections,
}: WorkbenchPersistenceControllerOptions) {
  const hydratedRef = useRef(false)
  const persistedKeyRef = useRef<string | null>(null)
  const getModuleRegistrationRef = useRef(getModuleRegistration)

  useEffect(() => {
    getModuleRegistrationRef.current = getModuleRegistration
  }, [getModuleRegistration])

  useEffect(() => {
    if (!appUiStateReady || !projectReady) return

    if (!hydratedRef.current) {
      const workspace = getAppUiStateSnapshot().workspace
      const nextLocation = resolveWorkbenchLocation(workspace.location, getModuleRegistrationRef.current, hasActiveProject)
      const nextSections = {
        browseOpen: workspace.navigation.expandedSections.includes('browse'),
        authoringOpen: workspace.navigation.expandedSections.includes('authoring'),
        toolsOpen: workspace.navigation.expandedSections.includes('tools'),
        devOpen: workspace.navigation.expandedSections.includes('development'),
      }
      if (!sideNavigationInteractedRef.current) {
        restoreCollapsed(workspace.navigation.collapsed)
        restoreSections(nextSections)
      }
      if (!navigationInteractedRef.current) restoreLocation(nextLocation)
      persistedKeyRef.current = JSON.stringify({ location: workspace.location, navigation: workspace.navigation })
      hydratedRef.current = true
      return
    }

    const shellState = {
      location,
      navigation: {
        collapsed,
        expandedSections: [
          ...(sections.browseOpen ? ['browse' as const] : []),
          ...(sections.authoringOpen ? ['authoring' as const] : []),
          ...(sections.toolsOpen ? ['tools' as const] : []),
          ...(sections.devOpen ? ['development' as const] : []),
        ],
      },
    }
    const nextKey = JSON.stringify(shellState)
    if (persistedKeyRef.current === nextKey) return
    persistedKeyRef.current = nextKey
    void applyAppUiStatePatch({ workspace: shellState })
  }, [
    appUiStateReady,
    collapsed,
    hasActiveProject,
    location,
    navigationInteractedRef,
    projectReady,
    restoreCollapsed,
    restoreLocation,
    restoreSections,
    sections,
    sideNavigationInteractedRef,
  ])
}
