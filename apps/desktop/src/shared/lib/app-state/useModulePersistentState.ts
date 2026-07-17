import { useEffect, useRef, useState } from 'react'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from './appUiState'

const persistDelayMs = 500

/**
 * Persists one workbench module preference under `workspace.modules[storageKey]`.
 * Writes are debounced; the latest value is flushed again on unmount.
 */
export function useModulePersistentState<T>(storageKey: string, initial: T, validate: (value: unknown) => value is T) {
  const [value, setValue] = useState<T>(() => {
    const stored = getAppUiStateSnapshot().workspace.modules[storageKey]?.value
    return validate(stored) ? stored : initial
  })
  const saved = useRef(JSON.stringify(value))
  const valueRef = useRef(value)
  valueRef.current = value
  useEffect(() => {
    const serialized = JSON.stringify(value)
    if (serialized === saved.current) return
    const timer = window.setTimeout(() => {
      saved.current = serialized
      void applyAppUiStatePatch({ workspace: { modules: { [storageKey]: { value } } } })
    }, persistDelayMs)
    return () => window.clearTimeout(timer)
  }, [storageKey, value])
  useEffect(
    () => () => {
      const serialized = JSON.stringify(valueRef.current)
      if (serialized !== saved.current) void applyAppUiStatePatch({ workspace: { modules: { [storageKey]: { value: valueRef.current } } } })
    },
    [storageKey],
  )
  return [value, setValue] as const
}
