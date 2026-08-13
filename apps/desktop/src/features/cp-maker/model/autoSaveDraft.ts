import { useEffect, useRef } from 'react'

export type AutoSaveDraftOptions = {
  /** Whether the draft has unsaved changes. */
  isDirty: boolean
  /** Commits the draft to disk. */
  onSave: () => void | Promise<void>
  /** Debounce delay in milliseconds after the last edit before auto-save triggers. Default 2000ms. */
  debounceMs?: number
}

/**
 * Auto-save hook for workbench drafts: saves automatically after a quiet period,
 * and flushes immediately on unmount if dirty.
 *
 * Used by `useWorkbenchAssetDraftPort` to replace manual save buttons.
 */
export function useAutoSaveDraft({ isDirty, onSave, debounceMs = 2000 }: AutoSaveDraftOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDirtyRef = useRef(isDirty)
  const onSaveRef = useRef(onSave)

  isDirtyRef.current = isDirty
  onSaveRef.current = onSave

  // Auto-save after quiet period
  useEffect(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    if (!isDirty) {
      return
    }

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      void onSaveRef.current()
    }, debounceMs)

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [isDirty, debounceMs])

  // Flush on unmount if dirty
  useEffect(() => {
    return () => {
      if (isDirtyRef.current) {
        void onSaveRef.current()
      }
    }
  }, [])
}
