import { useCallback, useEffect, useRef, useState } from 'react'
import { useCpMakerPort, type CpMakerSession, type UseCpMakerReturn } from '@features/cp-maker'

type WorkbenchProjectControllerOptions = {
  cpMaker: UseCpMakerReturn
  onRestoreFailed: () => void
  saveFailedMessage: string
  runWithExternalGuard: (action: () => void | Promise<void>) => Promise<boolean>
}

/** Restores and persists the active managed project through the cp-maker session port. */
export function useWorkbenchProjectController({
  cpMaker,
  onRestoreFailed,
  saveFailedMessage,
  runWithExternalGuard,
}: WorkbenchProjectControllerOptions) {
  const port = useCpMakerPort()
  const [session, setSession] = useState<CpMakerSession | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [restoreComplete, setRestoreComplete] = useState(false)
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<(() => void | Promise<void>) | null>(null)
  const [unsavedSaving, setUnsavedSaving] = useState(false)
  const [unsavedError, setUnsavedError] = useState<string | null>(null)
  const restoreAttemptedRef = useRef(false)
  const persistedActiveKeyRef = useRef<string | null>(null)
  const onRestoreFailedRef = useRef(onRestoreFailed)
  onRestoreFailedRef.current = onRestoreFailed

  useEffect(() => {
    let cancelled = false
    void port
      .loadSession()
      .then((loaded) => {
        if (!cancelled) {
          setSession(loaded)
          persistedActiveKeyRef.current = loaded.activeDraftKey
          setSessionLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession({ activeDraftKey: null, activeGeneratedDraftKey: null })
          persistedActiveKeyRef.current = null
          setSessionLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [port])

  useEffect(() => {
    if (!sessionLoaded || !cpMaker.draftsReady || restoreAttemptedRef.current) return
    restoreAttemptedRef.current = true
    const activeDraftKey = session?.activeDraftKey ?? null
    if (!activeDraftKey) {
      setRestoreComplete(true)
      return
    }
    if (cpMaker.drafts.some((draft) => draft.draftStorageKey === activeDraftKey)) {
      let cancelled = false
      void cpMaker.loadDraft(activeDraftKey).then(
        () => {
          if (!cancelled) setRestoreComplete(true)
        },
        () => {
          if (cancelled) return
          const cleared = { activeDraftKey: null, activeGeneratedDraftKey: session?.activeGeneratedDraftKey ?? null }
          persistedActiveKeyRef.current = null
          setSession(cleared)
          void port.saveSession(cleared)
          setRestoreComplete(true)
          onRestoreFailedRef.current()
        },
      )
      return () => {
        cancelled = true
      }
    }

    const cleared = { activeDraftKey: null, activeGeneratedDraftKey: session?.activeGeneratedDraftKey ?? null }
    persistedActiveKeyRef.current = null
    setSession(cleared)
    void port.saveSession(cleared)
    setRestoreComplete(true)
    onRestoreFailedRef.current()
  }, [cpMaker.drafts, cpMaker.draftsReady, cpMaker.loadDraft, port, session, sessionLoaded])

  useEffect(() => {
    if (!restoreComplete) return
    const activeDraftKey = cpMaker.activeDraft?.draftStorageKey ?? null
    if (persistedActiveKeyRef.current === activeDraftKey) return
    const next = { activeDraftKey, activeGeneratedDraftKey: session?.activeGeneratedDraftKey ?? null }
    persistedActiveKeyRef.current = activeDraftKey
    setSession(next)
    void port.saveSession(next)
  }, [cpMaker.activeDraft?.draftStorageKey, port, restoreComplete, session?.activeGeneratedDraftKey])

  const runWithUnsavedGuard = useCallback(
    async (action: () => void | Promise<void>) => {
      if (!cpMaker.isDirty) {
        await action()
        return true
      }
      setUnsavedError(null)
      setPendingUnsavedAction(() => action)
      return false
    },
    [cpMaker.isDirty],
  )

  const confirmSaveAndContinue = useCallback(async () => {
    if (!pendingUnsavedAction) return
    setUnsavedSaving(true)
    setUnsavedError(null)
    try {
      const saved = await cpMaker.saveDraft()
      if (!saved) {
        setUnsavedError(cpMaker.draftError ?? saveFailedMessage)
        return
      }
      const action = pendingUnsavedAction
      setPendingUnsavedAction(null)
      await action()
    } catch (error) {
      setUnsavedError(error instanceof Error ? error.message : String(error))
    } finally {
      setUnsavedSaving(false)
    }
  }, [cpMaker, pendingUnsavedAction, saveFailedMessage])

  const confirmDiscardAndContinue = useCallback(async () => {
    if (!pendingUnsavedAction) return
    const action = pendingUnsavedAction
    setPendingUnsavedAction(null)
    setUnsavedError(null)
    await action()
  }, [pendingUnsavedAction])

  const cancelUnsavedDecision = useCallback(() => {
    if (unsavedSaving) return
    setPendingUnsavedAction(null)
    setUnsavedError(null)
  }, [unsavedSaving])

  const runProjectAction = useCallback(
    (action: () => void | Promise<void>) =>
      runWithExternalGuard(async () => {
        await runWithUnsavedGuard(action)
      }),
    [runWithExternalGuard, runWithUnsavedGuard],
  )

  const createDraft = useCallback(
    (input: Parameters<UseCpMakerReturn['createDraft']>[0], onCreated?: () => void | Promise<void>) =>
      runProjectAction(async () => {
        await cpMaker.createDraft(input)
        await onCreated?.()
      }),
    [cpMaker, runProjectAction],
  )
  const importPack = useCallback(
    (sourcePath: string, onImported?: (draft: Awaited<ReturnType<UseCpMakerReturn['importPack']>>) => void | Promise<void>) =>
      runProjectAction(async () => {
        const imported = await cpMaker.importPack(sourcePath)
        await onImported?.(imported)
      }),
    [cpMaker, runProjectAction],
  )
  const selectDraft = useCallback(
    (draftStorageKey: string, onSelected?: () => void | Promise<void>) =>
      runProjectAction(async () => {
        await cpMaker.loadDraft(draftStorageKey)
        await onSelected?.()
      }),
    [cpMaker, runProjectAction],
  )
  const closeDraft = useCallback(
    (onClosed?: () => void | Promise<void>) =>
      runProjectAction(async () => {
        cpMaker.clearActiveDraft()
        await onClosed?.()
      }),
    [cpMaker.clearActiveDraft, runProjectAction],
  )
  const deleteDraft = useCallback(
    (draftStorageKey: string) => runProjectAction(() => cpMaker.deleteDraft(draftStorageKey)),
    [cpMaker, runProjectAction],
  )
  const reloadDraft = useCallback(
    (onReloaded?: () => void | Promise<void>) => {
      const draftStorageKey = cpMaker.activeDraft?.draftStorageKey
      return draftStorageKey
        ? runProjectAction(async () => {
            await cpMaker.loadDraft(draftStorageKey)
            await onReloaded?.()
          })
        : Promise.resolve(false)
    },
    [cpMaker.activeDraft?.draftStorageKey, cpMaker.loadDraft, runProjectAction],
  )

  return {
    projectReady: sessionLoaded && cpMaker.draftsReady && restoreComplete,
    session,
    pendingUnsavedAction,
    unsavedSaving,
    unsavedError,
    runWithUnsavedGuard,
    confirmSaveAndContinue,
    confirmDiscardAndContinue,
    cancelUnsavedDecision,
    createDraft,
    importPack,
    selectDraft,
    closeDraft,
    deleteDraft,
    reloadDraft,
  }
}
