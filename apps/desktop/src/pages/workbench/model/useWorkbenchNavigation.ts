import { useCallback, useReducer } from 'react'
import type { WorkbenchLocation, WorkbenchModuleRegistration } from '@shared/contracts'

type WorkbenchNavigationAction = { type: 'navigate'; location: WorkbenchLocation } | { type: 'home' }

/** Applies one canonical workbench location transition. */
export function reduceWorkbenchNavigation(_state: WorkbenchLocation, action: WorkbenchNavigationAction): WorkbenchLocation {
  return action.type === 'home' ? { kind: 'home' } : action.location
}

/** Resolves persisted and history locations against the live registry and project lifecycle. */
export function resolveWorkbenchLocation(
  location: WorkbenchLocation,
  getRegistration: (moduleId: string) => WorkbenchModuleRegistration | null,
  hasActiveProject: boolean,
): WorkbenchLocation {
  if (location.kind === 'home') return location
  const registration = getRegistration(location.moduleId)
  if (!registration || (registration.presentation === 'authoring' && !hasActiveProject)) {
    return { kind: 'home' }
  }
  return location
}

/** Owns the workbench's single home-or-module navigation destination. */
export function useWorkbenchNavigation(initialLocation: WorkbenchLocation) {
  const [location, dispatch] = useReducer(reduceWorkbenchNavigation, initialLocation)
  return {
    location,
    navigate: useCallback((next: WorkbenchLocation) => dispatch({ type: 'navigate', location: next }), []),
    openHome: useCallback(() => dispatch({ type: 'home' }), []),
  }
}
