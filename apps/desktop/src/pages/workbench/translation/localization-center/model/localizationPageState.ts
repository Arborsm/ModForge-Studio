import { useModulePersistentState } from '@shared/lib/app-state'

/** Ai-localization page state persisted under the `ai-localization/` module key prefix. */
export function useAiLocalizationPersistentState<T>(key: string, initial: T, validate: (value: unknown) => value is T) {
  return useModulePersistentState(`ai-localization/${key}`, initial, validate)
}
export const isString = (value: unknown): value is string => typeof value === 'string'
