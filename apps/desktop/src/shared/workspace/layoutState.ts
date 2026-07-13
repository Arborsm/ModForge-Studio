import type { WorkspaceChromeState, WorkspacePanelConfig, WorkspaceLayoutState, WorkspaceStoredState } from '@shared/contracts'

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function isItemsWorkspacePanels(panels?: WorkspacePanelConfig[]) {
  return panels?.some((panel) => panel.id.startsWith('item-browser/')) || false
}

export function isBuildingsWorkspacePanels(panels?: WorkspacePanelConfig[]) {
  return (
    panels?.some((panel) => panel.id === 'building-browser/browser') ||
    panels?.some((panel) => panel.id === 'building-browser/details') ||
    panels?.some((panel) => panel.id === 'building-browser/preview') ||
    false
  )
}

export function isEventsWorkspacePanels(panels?: WorkspacePanelConfig[]) {
  return (
    panels?.some((panel) => panel.id === 'event-browser/browser') ||
    panels?.some((panel) => panel.id === 'event-browser/stage') ||
    panels?.some((panel) => panel.id === 'event-browser/detail') ||
    false
  )
}

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

export function buildDefaultLayoutState(panels: WorkspacePanelConfig[]): WorkspaceLayoutState {
  return { chrome: getDefaultChrome(panels) }
}

export function sanitizeLayoutState(
  state: Partial<WorkspaceLayoutState> | null | undefined,
  panels: WorkspacePanelConfig[],
): WorkspaceLayoutState {
  return {
    chrome: normalizeChrome(state?.chrome, panels),
  }
}

export function createDefaultStoredState(panels: WorkspacePanelConfig[]) {
  return buildDefaultLayoutState(panels) satisfies WorkspaceStoredState
}

export function sanitizeStoredState(
  state: Partial<WorkspaceStoredState> | null | undefined,
  panels: WorkspacePanelConfig[],
): WorkspaceStoredState {
  return sanitizeLayoutState(state, panels)
}
