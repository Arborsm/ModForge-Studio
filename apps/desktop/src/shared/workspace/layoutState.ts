/**
 * @file Layout state helpers — default chrome per workspace type, normalization/clamping, and sanitization of persisted state.
 * @module shared/workspace
 */

import type { WorkspaceChromeState, WorkspacePanelConfig, WorkspaceLayoutState, WorkspaceStoredState } from '@shared/contracts'

/** Clamps `value` to the inclusive `[minimum, maximum]` range. */
export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

/** Returns true when the panel set matches the items workspace (panel ids prefixed `item-browser/`). */
export function isItemsWorkspacePanels(panels?: WorkspacePanelConfig[]) {
  return panels?.some((panel) => panel.id.startsWith('item-browser/')) || false
}

/** Returns true when the panel set matches the buildings workspace (browser/details/preview panels). */
export function isBuildingsWorkspacePanels(panels?: WorkspacePanelConfig[]) {
  return (
    panels?.some((panel) => panel.id === 'building-browser/browser') ||
    panels?.some((panel) => panel.id === 'building-browser/details') ||
    panels?.some((panel) => panel.id === 'building-browser/preview') ||
    false
  )
}

/** Returns true when the panel set matches the events workspace (browser/stage/detail panels). */
export function isEventsWorkspacePanels(panels?: WorkspacePanelConfig[]) {
  return (
    panels?.some((panel) => panel.id === 'event-browser/browser') ||
    panels?.some((panel) => panel.id === 'event-browser/stage') ||
    panels?.some((panel) => panel.id === 'event-browser/detail') ||
    false
  )
}

/** Returns the default chrome proportions (widths, heights, splits) for the given panel set's workspace type. */
export function getDefaultChrome(panels?: WorkspacePanelConfig[]): WorkspaceChromeState {
  const isItemsWorkspace = isItemsWorkspacePanels(panels)
  const isBuildingsWorkspace = isBuildingsWorkspacePanels(panels)
  const isEventsWorkspace = isEventsWorkspacePanels(panels)

  if (isItemsWorkspace) {
    return {
      leftWidth: 0.15,
      rightWidth: 0.5,
      bottomHeight: 220,
      leftSplit: 0.44,
      rightSplit: 0.34,
      bottomSplit: 0.5,
    }
  }

  if (isBuildingsWorkspace || isEventsWorkspace) {
    return {
      leftWidth: 0.14,
      rightWidth: 0.16,
      bottomHeight: 220,
      leftSplit: 0.44,
      rightSplit: 0.34,
      bottomSplit: 0.5,
    }
  }

  return {
    leftWidth: 0.22,
    rightWidth: 0.24,
    bottomHeight: 220,
    leftSplit: 0.44,
    rightSplit: 0.34,
    bottomSplit: 0.5,
  }
}

/** Normalizes a partial chrome state against defaults and clamps each field to its allowed range. */
export function normalizeChrome(chrome: Partial<WorkspaceChromeState> | undefined, panels?: WorkspacePanelConfig[]) {
  const defaults = getDefaultChrome(panels)
  const isItemsWorkspace = isItemsWorkspacePanels(panels)

  return {
    leftWidth: clamp(
      typeof chrome?.leftWidth === 'number' ? chrome.leftWidth : defaults.leftWidth,
      isItemsWorkspace ? 0.12 : 0.14,
      isItemsWorkspace ? 0.24 : 0.32,
    ),
    rightWidth: clamp(
      typeof chrome?.rightWidth === 'number' ? chrome.rightWidth : defaults.rightWidth,
      isItemsWorkspace ? 0.38 : 0.16,
      isItemsWorkspace ? 0.62 : 0.36,
    ),
    bottomHeight: clamp(typeof chrome?.bottomHeight === 'number' ? chrome.bottomHeight : defaults.bottomHeight, 180, 280),
    leftSplit: clamp(typeof chrome?.leftSplit === 'number' ? chrome.leftSplit : defaults.leftSplit, 0.2, 0.8),
    rightSplit: clamp(typeof chrome?.rightSplit === 'number' ? chrome.rightSplit : defaults.rightSplit, 0.2, 0.8),
    bottomSplit: clamp(typeof chrome?.bottomSplit === 'number' ? chrome.bottomSplit : defaults.bottomSplit, 0.2, 0.8),
  } satisfies WorkspaceChromeState
}

/** Builds a fresh default layout state for the given panel set. */
export function buildDefaultLayoutState(panels: WorkspacePanelConfig[]): WorkspaceLayoutState {
  return { chrome: getDefaultChrome(panels) }
}

/** Sanitizes a partial/null layout state into a fully valid `WorkspaceLayoutState` using defaults and clamping. */
export function sanitizeLayoutState(
  state: Partial<WorkspaceLayoutState> | null | undefined,
  panels: WorkspacePanelConfig[],
): WorkspaceLayoutState {
  return {
    chrome: normalizeChrome(state?.chrome, panels),
  }
}

/** Creates a default stored state (same shape as layout state) for the given panel set. */
export function createDefaultStoredState(panels: WorkspacePanelConfig[]) {
  return buildDefaultLayoutState(panels) satisfies WorkspaceStoredState
}

/** Sanitizes a partial/null stored state into a fully valid `WorkspaceStoredState`. */
export function sanitizeStoredState(
  state: Partial<WorkspaceStoredState> | null | undefined,
  panels: WorkspacePanelConfig[],
): WorkspaceStoredState {
  return sanitizeLayoutState(state, panels)
}
