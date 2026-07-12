import type { RefObject } from 'react'
import type { LocaleCode, ThemeMode } from '@locales/api'
import type { PlayerAppearanceProfile } from '@entities/event'
import type { GameDirectoryInfo } from '@entities/game/api'
import type { WorkspaceLayoutHandle, WorkspaceStoredState } from '@shared/contracts'
import { useWorkbenchRuntimeInputs } from './runtimeInputs'

export type EntityBrowserRuntimeProps = {
  copy: (typeof import('@locales/api').editorCopy)[LocaleCode]
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  directoryInfo: GameDirectoryInfo | null
  heavyWorkspaceReady: boolean
  workspaceLayoutRef: RefObject<WorkspaceLayoutHandle | null>
  workspaceLayoutStorageKey: string
  workspaceLayouts: Record<string, WorkspaceStoredState>
  playerAppearanceProfile: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow: () => void
  onPersistStateChange: (storageKey: string, state: WorkspaceStoredState) => void
}

export function useEntityBrowserRuntimeProps(): EntityBrowserRuntimeProps {
  const { copy, locale, theme, environment, moduleState } = useWorkbenchRuntimeInputs()
  return {
    copy,
    locale,
    theme,
    accentColor: environment.accentColor,
    directoryInfo: environment.directoryInfo,
    heavyWorkspaceReady: environment.heavyWorkspaceReady,
    workspaceLayoutRef: moduleState.layoutRef,
    workspaceLayoutStorageKey: moduleState.persistenceKey,
    workspaceLayouts: moduleState.layouts,
    playerAppearanceProfile: environment.playerAppearanceProfile,
    onOpenPlayerAppearanceWindow: environment.onOpenPlayerAppearanceWindow,
    onPersistStateChange: moduleState.onPersistStateChange,
  }
}
