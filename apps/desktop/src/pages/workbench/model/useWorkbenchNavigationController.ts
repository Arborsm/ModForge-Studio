import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { WorkbenchLocation, WorkbenchModuleRegistration } from '@shared/contracts'
import { resolveWorkbenchLocation, type useWorkbenchNavigation } from './useWorkbenchNavigation'
import { useWorkbenchShellHistory } from './useWorkbenchShellHistory'
import { toShellLocation, type WorkbenchShellLocation } from './workbenchShellHistory'
import { useEditModeStore } from './editModeStore'

type NavigationState = ReturnType<typeof useWorkbenchNavigation>
type Guard = (action: () => void | Promise<void>) => Promise<boolean>

export type WorkbenchOpenModuleOptions = {
  /** Allows a successful project create/import transition to precede the React state commit. */
  hasActiveProject?: boolean
  /** Resets project-scoped history only after guards accept the transition. */
  resetHistoryTo?: WorkbenchLocation
}

type WorkbenchNavigationControllerOptions = {
  active: boolean
  rootRef: RefObject<HTMLElement | null>
  navigation: NavigationState
  hasActiveProject: boolean
  getRegistration: (moduleId: string) => WorkbenchModuleRegistration | null
  ensureSectionOpen: (section: 'browseOpen' | 'authoringOpen' | 'translationOpen' | 'toolsOpen' | 'devOpen') => void
  runWithModuleGuard: Guard
}

/**
 * Owns registry resolution, guarded transitions, shortcuts, and Workbench shell history.
 * Navigation only runs the module guard: the managed-project draft lives above the module
 * host and survives view switches, so the project guard must not intercept them.
 */
export function useWorkbenchNavigationController({
  active,
  rootRef,
  navigation,
  hasActiveProject,
  getRegistration,
  ensureSectionOpen,
  runWithModuleGuard,
}: WorkbenchNavigationControllerOptions) {
  const navigationInteractedRef = useRef(false)
  const getRegistrationRef = useRef(getRegistration)
  const hasActiveProjectRef = useRef(hasActiveProject)
  const lastModuleIdRef = useRef('map-browser')
  getRegistrationRef.current = getRegistration
  hasActiveProjectRef.current = hasActiveProject

  const applyLocation = useCallback(
    (location: WorkbenchShellLocation) => {
      navigationInteractedRef.current = true
      const baseLocation: WorkbenchLocation =
        location.kind === 'module' ? { kind: 'module', moduleId: location.moduleId } : { kind: 'home' }
      const resolved = resolveWorkbenchLocation(baseLocation, getRegistrationRef.current, hasActiveProjectRef.current)
      const registration = resolved.kind === 'module' ? getRegistrationRef.current(resolved.moduleId) : null
      navigation.navigate(resolved)
      if (registration) {
        const sectionKey = registration.navigation.section === 'development' ? 'devOpen' : `${registration.navigation.section}Open`
        ensureSectionOpen(sectionKey as 'browseOpen' | 'authoringOpen' | 'translationOpen' | 'toolsOpen' | 'devOpen')
        if (registration.presentation === 'authoring') {
          // Restore the patch from the shell location, or default to list view.
          useEditModeStore.getState().setPatch(location.kind === 'module' ? (location.patchId ?? null) : null)
        } else {
          useEditModeStore.getState().reset()
        }
      } else {
        useEditModeStore.getState().reset()
      }
    },
    [ensureSectionOpen, navigation.navigate],
  )
  const restoreHistoryLocation = useCallback(
    (location: WorkbenchShellLocation, commit: () => void) => {
      void runWithModuleGuard(() => {
        commit()
        applyLocation(location)
      })
    },
    [applyLocation, runWithModuleGuard],
  )
  const history = useWorkbenchShellHistory({
    rootRef,
    enabled: active,
    location: toShellLocation(navigation.location),
    onRestoreLocation: restoreHistoryLocation,
  })
  const pushHistory = history.push
  const resetHistoryAndPush = history.resetToAndPush

  const openHome = useCallback(() => {
    if (navigation.location.kind === 'home') return Promise.resolve(true)
    return runWithModuleGuard(() => {
      const location: WorkbenchShellLocation = { kind: 'home' }
      applyLocation(location)
      pushHistory(location)
    })
  }, [applyLocation, navigation.location.kind, pushHistory, runWithModuleGuard])

  const openModule = useCallback(
    (moduleId: string, options?: WorkbenchOpenModuleOptions) => {
      const registration = getRegistrationRef.current(moduleId)
      const hasProject = options?.hasActiveProject ?? hasActiveProjectRef.current
      if (!registration || (registration.presentation === 'authoring' && !hasProject)) {
        return openHome()
      }
      return runWithModuleGuard(() => {
        const location: WorkbenchShellLocation = { kind: 'module', moduleId: registration.id }
        applyLocation(location)
        if (options?.resetHistoryTo) resetHistoryAndPush(toShellLocation(options.resetHistoryTo), location)
        else pushHistory(location)
      })
    },
    [applyLocation, openHome, pushHistory, resetHistoryAndPush, runWithModuleGuard],
  )

  useEffect(() => {
    if (navigation.location.kind === 'module') lastModuleIdRef.current = navigation.location.moduleId
  }, [navigation.location])

  useEffect(() => {
    if (!active) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape' && navigation.location.kind === 'home') {
        void openModule(lastModuleIdRef.current)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && navigation.location.kind !== 'home') {
        event.preventDefault()
        void openHome()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, navigation.location.kind, openHome, openModule])

  return {
    navigationInteractedRef,
    applyLocation,
    openHome,
    openModule,
    pushLocation: history.push,
    resetHistory: history.resetTo,
    goBack: history.goBack,
    goForward: history.goForward,
    canGoBack: history.canGoBack,
    canGoForward: history.canGoForward,
  }
}
