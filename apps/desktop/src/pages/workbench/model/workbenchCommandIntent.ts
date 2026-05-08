import { useCallback, useEffect, useRef, useState } from 'react'
import type { PendingWorkbenchCommandIntent, AppCommand } from '@shared/contracts'
import type { UseCpMakerReturn } from '@features/cp-maker'

export type WorkbenchCommandIntentDeps = {
  pendingIntent: PendingWorkbenchCommandIntent | null
  cpMaker: UseCpMakerReturn
  setWorkspaceMode: (mode: string) => void
  setWorkspaceViewMode: (mode: 'edit' | 'preview') => void
  navigateToPatch: (patchId: string | null) => void
  clearPendingIntent: () => void
}

export function resolveWorkbenchOpenAssetTarget(
  command: Extract<AppCommand, { type: 'workbench/open-asset' }>,
  cpMaker: UseCpMakerReturn,
): { workspaceId: string; assetId: string } | null {
  // Resolve the patch from active draft patches
  const patch = cpMaker.activeDraft?.patches.find((p) => p.id === command.assetId)
  if (!patch) {
    return null
  }

  return {
    workspaceId: patch.workspace,
    assetId: command.assetId,
  }
}

export function useWorkbenchCommandIntent({
  pendingIntent: pendingIntentProp,
  cpMaker,
  setWorkspaceMode,
  setWorkspaceViewMode,
  navigateToPatch,
  clearPendingIntent,
}: WorkbenchCommandIntentDeps) {
  const [consumedIntentId, setConsumedIntentId] = useState<string | null>(null)
  const consumedIntentIdsRef = useRef(new Set<string>())
  const loadAttemptedRef = useRef<Set<string>>(new Set())

  // Track active draft changes to detect load completion
  const prevDraftKeyRef = useRef<string | null>(null)

  // Reset retry state when pending intent changes
  const prevIntentIdRef = useRef<string | null>(null)
  useEffect(() => {
    const id = pendingIntentProp?.id ?? null
    if (id !== prevIntentIdRef.current) {
      prevIntentIdRef.current = id
      loadAttemptedRef.current = new Set()
    }
  }, [pendingIntentProp?.id])

  const consume = useCallback(
    (intent: PendingWorkbenchCommandIntent) => {
      const cmd = intent.command

      if (cmd.type === 'navigation/open-workbench-view') {
        if (cmd.viewId === 'studio-desk') {
          setWorkspaceMode('mods')
          setWorkspaceViewMode('edit')
          navigateToPatch(null)
        } else if (cmd.viewId === 'workspace-editor') {
          // Preserve current workspace, switch to edit mode
          setWorkspaceViewMode('edit')
          navigateToPatch(null)
        }

        // Unsupported view ids: safe no-op (just clear intent)
        consumedIntentIdsRef.current.add(intent.id)
        clearPendingIntent()
        setConsumedIntentId(intent.id)
        return
      }

      if (cmd.type === 'workbench/open-asset') {
        // Check if draft needs loading
        const currentDraftKey: string | undefined = cpMaker.activeDraft?.draftStorageKey
        const needsLoad = cmd.sourceId && cmd.sourceId !== currentDraftKey

        if (needsLoad && cmd.sourceId) {
          if (!loadAttemptedRef.current.has(cmd.sourceId)) {
            loadAttemptedRef.current.add(cmd.sourceId)
            void cpMaker.loadDraft(cmd.sourceId)
          } else if (!cpMaker.draftLoading && cpMaker.draftError) {
            consumedIntentIdsRef.current.add(intent.id)
            clearPendingIntent()
            setConsumedIntentId(intent.id)
          }
          return
        }

        // Resolve the patch
        const target = resolveWorkbenchOpenAssetTarget(cmd, cpMaker)
        if (!target) {
          // Missing patch: safe failure
          consumedIntentIdsRef.current.add(intent.id)
          clearPendingIntent()
          setConsumedIntentId(intent.id)
          return
        }

        consumedIntentIdsRef.current.add(intent.id)
        setWorkspaceMode(target.workspaceId)
        setWorkspaceViewMode('edit')
        navigateToPatch(target.assetId)
        clearPendingIntent()
        setConsumedIntentId(intent.id)
      }
    },
    [cpMaker, setWorkspaceMode, setWorkspaceViewMode, navigateToPatch, clearPendingIntent],
  )

  // Trigger consumption when pending intent changes
  useEffect(() => {
    if (!pendingIntentProp) {
      return
    }

    // Skip if already consumed
    if (consumedIntentIdsRef.current.has(pendingIntentProp.id)) {
      return
    }

    const id = setTimeout(() => consume(pendingIntentProp), 0)
    return () => clearTimeout(id)
  }, [pendingIntentProp, consume])

  // Retry open-asset consumption when activeDraft changes (draft loaded)
  useEffect(() => {
    const currentKey = cpMaker.activeDraft?.draftStorageKey ?? null
    if (currentKey === prevDraftKeyRef.current) {
      return
    }
    prevDraftKeyRef.current = currentKey

    // If we have a pending open-asset intent, retry consumption
    if (!pendingIntentProp || pendingIntentProp.command.type !== 'workbench/open-asset') {
      return
    }
    if (consumedIntentIdsRef.current.has(pendingIntentProp.id)) {
      return
    }

    const id = setTimeout(() => consume(pendingIntentProp), 0)
    return () => clearTimeout(id)
  }, [cpMaker.activeDraft, cpMaker.draftError, cpMaker.draftLoading, pendingIntentProp, consume])

  return { consumedIntentId }
}
