import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceMode } from '@locales'
import type { WorkbenchViewRegistration } from '@shared/contracts'

/**
 * A launchpad recent-page entry. The `mode` flavour matches the workspace mode
 * that backs the entry; `mods` is only ever remembered as a project page, which
 * is intentionally excluded by {@link canRememberRecentPage}.
 */
export type LaunchpadRecentPage = { kind: 'root' | 'project'; mode: WorkspaceMode } | { kind: 'dev'; viewId: string }

type DevWorkbenchViewNavigationItem = WorkbenchViewRegistration & {
  active?: boolean
}

type WorkspaceViewMode = 'edit' | 'preview'

const DEFAULT_RECENT_PAGES: LaunchpadRecentPage[] = []
const MAX_RECENT_MODES = 4

export function getRecentPageKey(page: LaunchpadRecentPage) {
  return page.kind === 'dev' ? `${page.kind}:${page.viewId}` : `${page.kind}:${page.mode}`
}

/**
 * The fixed project page is a permanent recent-pages outlier: it never rotates
 * out of the dock and never gets remembered, so it stays a stable project entry.
 */
export function canRememberRecentPage(page: LaunchpadRecentPage) {
  return page.kind === 'dev' || page.mode !== 'mods'
}

type UseWorkbenchLaunchpadRecentPagesOptions = {
  workspaceMode: WorkspaceMode
  workspaceViewMode: WorkspaceViewMode
  hasActiveProject: boolean
  devViews?: readonly DevWorkbenchViewNavigationItem[]
}

/**
 * Owns the launchpad recent-pages list plus the active-page remembering effect
 * that keeps the dock in sync as the user navigates through the workbench.
 */
export function useWorkbenchLaunchpadRecentPages({
  workspaceMode,
  workspaceViewMode,
  hasActiveProject,
  devViews = [],
}: UseWorkbenchLaunchpadRecentPagesOptions) {
  const [recentPages, setRecentPages] = useState<LaunchpadRecentPage[]>(() =>
    workspaceViewMode === 'preview' && workspaceMode !== 'mods'
      ? [
          { kind: 'root', mode: workspaceMode },
          ...DEFAULT_RECENT_PAGES.filter((page) => page.kind !== 'dev' && page.mode !== workspaceMode),
        ]
      : DEFAULT_RECENT_PAGES,
  )

  const rememberRecentPage = useCallback((page: LaunchpadRecentPage) => {
    if (!canRememberRecentPage(page)) {
      return
    }

    const pageKey = getRecentPageKey(page)
    setRecentPages((current) => {
      if (current.some((candidate) => getRecentPageKey(candidate) === pageKey)) {
        return current
      }

      if (current.length < MAX_RECENT_MODES) {
        return [...current, page]
      }

      return [...current.slice(1), page]
    })
  }, [])

  useEffect(() => {
    if (devViews.some((view) => view.active)) {
      return
    }

    let canceled = false
    const rememberActivePage = (page: LaunchpadRecentPage) => {
      queueMicrotask(() => {
        if (!canceled) {
          rememberRecentPage(page)
        }
      })
    }

    if (workspaceViewMode === 'preview') {
      rememberActivePage({ kind: 'root', mode: workspaceMode })
      return () => {
        canceled = true
      }
    }

    if (workspaceMode !== 'mods' && hasActiveProject) {
      rememberActivePage({ kind: 'project', mode: workspaceMode })
    }

    return () => {
      canceled = true
    }
  }, [devViews, hasActiveProject, rememberRecentPage, workspaceMode, workspaceViewMode])

  return {
    recentPages,
    rememberRecentPage,
  }
}
