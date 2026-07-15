import { useEffect, useRef, useState } from 'react'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'

const delay = 500
export function useAiLocalizationPersistentState<T>(key: string, initial: T, validate: (value: unknown) => value is T) {
  const storageKey = `ai-localization/${key}`
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
    }, delay)
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
export const isString = (value: unknown): value is string => typeof value === 'string'
