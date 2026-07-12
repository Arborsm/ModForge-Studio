import { useCallback, useEffect, useRef } from 'react'

type GuardRunner = (action: () => void | Promise<void>) => Promise<boolean>

type WorkbenchCloseControllerOptions = {
  active: boolean
  moduleDirty: boolean
  projectDirty: boolean
  moduleDecisionPending: boolean
  projectDecisionPending: boolean
  runWithModuleGuard: GuardRunner
  runWithProjectGuard: GuardRunner
  closeWindow: () => boolean | Promise<boolean>
  onCloseRequestChange?: (handler: (() => boolean | Promise<boolean>) | null) => void
}

/** Coordinates module and managed-project guards for native and browser close requests. */
export function useWorkbenchCloseController({
  active,
  moduleDirty,
  projectDirty,
  moduleDecisionPending,
  projectDecisionPending,
  runWithModuleGuard,
  runWithProjectGuard,
  closeWindow,
  onCloseRequestChange,
}: WorkbenchCloseControllerOptions) {
  const armedRef = useRef(false)

  useEffect(() => {
    if (!moduleDecisionPending && !projectDecisionPending) armedRef.current = false
  }, [moduleDecisionPending, projectDecisionPending])

  const handleClose = useCallback(async () => {
    if (armedRef.current) return false
    const hasUnsavedChanges = moduleDirty || projectDirty
    let accepted = false
    armedRef.current = true
    await runWithModuleGuard(async () => {
      await runWithProjectGuard(async () => {
        accepted = await closeWindow()
      })
    })
    if (!accepted && !hasUnsavedChanges) armedRef.current = false
    return accepted
  }, [closeWindow, moduleDirty, projectDirty, runWithModuleGuard, runWithProjectGuard])

  useEffect(() => {
    if (!active) return
    onCloseRequestChange?.(handleClose)
    return () => onCloseRequestChange?.(null)
  }, [active, handleClose, onCloseRequestChange])

  useEffect(() => {
    if (!moduleDirty && !projectDirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [moduleDirty, projectDirty])

  return handleClose
}
