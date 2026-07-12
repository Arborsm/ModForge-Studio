import { useCallback, useReducer } from 'react'
import type { WorkspaceMode } from '@locales/api'
import type { WorkbenchShellLocation } from './workbenchShellHistory'

export type WorkbenchNavigationState =
  | { kind: 'home'; workspaceMode: WorkspaceMode; workspaceViewMode: 'edit' | 'preview' }
  | { kind: 'workspace'; workspaceMode: WorkspaceMode; workspaceViewMode: 'edit' | 'preview' }
  | { kind: 'registered-view'; workspaceMode: WorkspaceMode; viewId: string }

type WorkbenchNavigationAction =
  | { type: 'restore'; state: WorkbenchNavigationState }
  | { type: 'set-route'; route: 'home' | 'workspace' }
  | { type: 'set-workspace'; mode: WorkspaceMode }
  | { type: 'set-view-mode'; mode: 'edit' | 'preview' }
  | { type: 'set-registered-view'; viewId: string | null }

/** Converts persisted/history state into one canonical, mutually exclusive navigation destination. */
export function decodeWorkbenchNavigation(location: WorkbenchShellLocation): WorkbenchNavigationState {
  if (location.workbenchRoute === 'home') {
    return {
      kind: 'home',
      workspaceMode: location.workspaceMode,
      workspaceViewMode: location.workspaceViewMode,
    }
  }

  if (location.registeredWorkbenchViewId) {
    return {
      kind: 'registered-view',
      workspaceMode: location.workspaceMode,
      viewId: location.registeredWorkbenchViewId,
    }
  }

  return {
    kind: 'workspace',
    workspaceMode: location.workspaceMode,
    workspaceViewMode: location.workspaceViewMode,
  }
}

/** Encodes the canonical destination for persistence and browser-style history. */
export function encodeWorkbenchNavigation(state: WorkbenchNavigationState): WorkbenchShellLocation {
  if (state.kind === 'registered-view') {
    return {
      workbenchRoute: 'workspace',
      workspaceMode: state.workspaceMode,
      workspaceViewMode: 'edit',
      registeredWorkbenchViewId: state.viewId,
    }
  }

  return {
    workbenchRoute: state.kind,
    workspaceMode: state.workspaceMode,
    workspaceViewMode: state.workspaceViewMode,
    registeredWorkbenchViewId: null,
  }
}

export function reduceWorkbenchNavigation(state: WorkbenchNavigationState, action: WorkbenchNavigationAction): WorkbenchNavigationState {
  if (action.type === 'restore') {
    return action.state
  }
  if (action.type === 'set-route') {
    if (action.route === 'home') {
      return {
        kind: 'home',
        workspaceMode: state.workspaceMode,
        workspaceViewMode: state.kind === 'registered-view' ? 'edit' : state.workspaceViewMode,
      }
    }
    return state.kind === 'home' ? { ...state, kind: 'workspace' } : state
  }
  if (action.type === 'set-workspace') {
    return {
      kind: state.kind === 'home' ? 'home' : 'workspace',
      workspaceMode: action.mode,
      workspaceViewMode: state.kind === 'registered-view' ? 'edit' : state.workspaceViewMode,
    }
  }
  if (action.type === 'set-view-mode') {
    if (state.kind === 'registered-view' && action.mode === 'edit') {
      return state
    }
    return {
      kind: state.kind === 'home' ? 'home' : 'workspace',
      workspaceMode: state.workspaceMode,
      workspaceViewMode: action.mode,
    }
  }
  if (action.viewId) {
    return { kind: 'registered-view', workspaceMode: state.workspaceMode, viewId: action.viewId }
  }
  return state.kind === 'registered-view' ? { kind: 'workspace', workspaceMode: state.workspaceMode, workspaceViewMode: 'edit' } : state
}

/** Owns the workbench's single canonical navigation destination. */
export function useWorkbenchNavigation(initialLocation: WorkbenchShellLocation) {
  const [state, dispatch] = useReducer(reduceWorkbenchNavigation, initialLocation, decodeWorkbenchNavigation)
  const location = encodeWorkbenchNavigation(state)

  return {
    state,
    location,
    restore: useCallback((next: WorkbenchShellLocation) => dispatch({ type: 'restore', state: decodeWorkbenchNavigation(next) }), []),
    setWorkbenchRoute: useCallback((route: 'home' | 'workspace') => dispatch({ type: 'set-route', route }), []),
    setWorkspaceMode: useCallback((mode: WorkspaceMode) => dispatch({ type: 'set-workspace', mode }), []),
    setWorkspaceViewMode: useCallback((mode: 'edit' | 'preview') => dispatch({ type: 'set-view-mode', mode }), []),
    setRegisteredWorkbenchViewId: useCallback((viewId: string | null) => dispatch({ type: 'set-registered-view', viewId }), []),
  }
}
