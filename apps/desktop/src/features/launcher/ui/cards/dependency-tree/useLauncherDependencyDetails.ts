import { useCallback, useEffect, useRef, useState } from 'react'
import type { LauncherPort } from '../../../model/launcherPort'
import type { LauncherDetailTab } from '../launcherModDetailData'
import type { RemoteDependencyLoadState } from './dependencyTreeTypes'

export type UseLauncherDependencyDetailsInput = {
  detailContentKey: string
  launcherPort: LauncherPort
}

export type UsePreloadLauncherDependencyDetailsInput = {
  open: boolean
  selectedTab: LauncherDetailTab
  loadableModIds: Set<number>
  loadRemoteDependencyDetail: (modId: number) => void
}

/** Owns remote dependency detail request state for the active detail drawer item. */
export function useLauncherDependencyDetails({ detailContentKey, launcherPort }: UseLauncherDependencyDetailsInput) {
  const [remoteDependencyDetails, setRemoteDependencyDetails] = useState<Record<number, RemoteDependencyLoadState>>({})
  const loadedModIdsRef = useRef(new Set<number>())
  const requestScopeRef = useRef(0)

  useEffect(() => {
    requestScopeRef.current += 1
    loadedModIdsRef.current = new Set()
    setRemoteDependencyDetails({})
  }, [detailContentKey])

  const loadRemoteDependencyDetail = useCallback(
    (modId: number) => {
      if (loadedModIdsRef.current.has(modId)) {
        return
      }
      loadedModIdsRef.current.add(modId)

      setRemoteDependencyDetails((current) => {
        if (current[modId]?.state === 'loading' || current[modId]?.state === 'ready') {
          return current
        }
        return {
          ...current,
          [modId]: { state: 'loading' },
        }
      })
      const requestScope = requestScopeRef.current
      void launcherPort
        .loadRemoteModDetail({ modId, includeFiles: false })
        .then((detail) => {
          if (requestScopeRef.current !== requestScope) {
            return
          }
          setRemoteDependencyDetails((current) => ({
            ...current,
            [modId]: { state: 'ready', detail },
          }))
        })
        .catch((error: unknown) => {
          if (requestScopeRef.current !== requestScope) {
            return
          }
          loadedModIdsRef.current.delete(modId)
          setRemoteDependencyDetails((current) => ({
            ...current,
            [modId]: { state: 'error', error: error instanceof Error ? error.message : String(error) },
          }))
        })
    },
    [launcherPort],
  )

  return {
    remoteDependencyDetails,
    loadRemoteDependencyDetail,
  }
}

/** Preloads every currently loadable dependency id so the Dependencies tab expands the full tree by design. */
export function usePreloadLauncherDependencyDetails({
  open,
  selectedTab,
  loadableModIds,
  loadRemoteDependencyDetail,
}: UsePreloadLauncherDependencyDetailsInput) {
  const loadableModIdKey = Array.from(loadableModIds)
    .sort((left, right) => left - right)
    .join('|')

  useEffect(() => {
    if (!open || selectedTab !== 'dependencies') {
      return
    }

    if (!loadableModIdKey) {
      return
    }

    loadableModIdKey.split('|').forEach((rawModId) => {
      const modId = Number(rawModId)
      if (!Number.isFinite(modId)) {
        return
      }
      loadRemoteDependencyDetail(modId)
    })
  }, [loadRemoteDependencyDetail, loadableModIdKey, open, selectedTab])
}
