import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { WorkbenchLocation, WorkbenchModuleRegistration } from '@shared/contracts'
import { resolveWorkbenchLocation, type useWorkbenchNavigation } from './useWorkbenchNavigation'
import { useWorkbenchShellHistory } from './useWorkbenchShellHistory'

type NavigationState = ReturnType<typeof useWorkbenchNavigation>
type Guard = (action: () => void | Promise<void>) => Promise<boolean>

type WorkbenchNavigationControllerOptions = {
  active: boolean
  rootRef: RefObject<HTMLElement | null>
  navigation: NavigationState
  hasActiveProject: boolean
  getRegistration: (moduleId: string) => WorkbenchModuleRegistration | null
  resetAuthoringNavigation: () => void
  runWithModuleGuard: Guard
  runWithProjectGuard: Guard
}

/** Owns registry resolution, guarded transitions, shortcuts, and Workbench shell history. */
export function useWorkbenchNavigationController({
  active,
  rootRef,
  navigation,
  hasActiveProject,
  getRegistration,
  resetAuthoringNavigation,
  runWithModuleGuard,
  runWithProjectGuard,
}: WorkbenchNavigationControllerOptions) {
  const navigationInteractedRef = useRef(false)
  const getRegistrationRef = useRef(getRegistration)
  const hasActiveProjectRef = useRef(hasActiveProject)
  const lastModuleIdRef = useRef('map-browser')
  getRegistrationRef.current = getRegistration
  hasActiveProjectRef.current = hasActiveProject

  const applyLocation = useCallback(
    (location: WorkbenchLocation) => {
      navigationInteractedRef.current = true
      const resolved = resolveWorkbenchLocation(location, getRegistrationRef.current, hasActiveProjectRef.current)
      const registration = resolved.kind === 'module' ? getRegistrationRef.current(resolved.moduleId) : null
      navigation.navigate(resolved)
      if (registration?.presentation === 'authoring') resetAuthoringNavigation()
    },
    [navigation.navigate, resetAuthoringNavigation],
  )
  const runGuarded = useCallback(
    async (action: () => void | Promise<void>) => {
      return runWithModuleGuard(async () => {
        await runWithProjectGuard(action)
      })
    },
    [runWithModuleGuard, runWithProjectGuard],
  )
  const restoreHistoryLocation = useCallback(
    (location: WorkbenchLocation, commit: () => void) => {
      void runGuarded(() => {
        commit()
        applyLocation(location)
      })
    },
    [applyLocation, runGuarded],
  )
  const history = useWorkbenchShellHistory({
    rootRef,
    enabled: active,
    location: navigation.location,
    onRestoreLocation: restoreHistoryLocation,
  })

  const openHome = useCallback(() => {
    void runGuarded(() => {
      const location = { kind: 'home' as const }
      applyLocation(location)
      history.push(location)
    })
  }, [applyLocation, history.push, runGuarded])

  const openModule = useCallback(
    (moduleId: string) => {
      const registration = getRegistrationRef.current(moduleId)
      if (!registration || (registration.presentation === 'authoring' && !hasActiveProjectRef.current)) {
        openHome()
        return
      }
      void runGuarded(() => {
        const location = { kind: 'module' as const, moduleId: registration.id }
        applyLocation(location)
        history.push(location)
      })
    },
    [applyLocation, history.push, openHome, runGuarded],
  )

  useEffect(() => {
    if (navigation.location.kind === 'module') lastModuleIdRef.current = navigation.location.moduleId
  }, [navigation.location])

  useEffect(() => {
    if (!active) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape' && navigation.location.kind === 'home') {
        openModule(lastModuleIdRef.current)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && navigation.location.kind !== 'home') {
        event.preventDefault()
        openHome()
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
