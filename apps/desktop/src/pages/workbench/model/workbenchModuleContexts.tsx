import { createContext, useContext, type ReactNode, type RefObject } from 'react'
import type { GameDirectoryInfo } from '@entities/game/api'
import type { PlayerAppearanceProfile } from '@entities/event'
import type { WorkspaceStatus } from '@entities/map'
import type { SettingsWindowCategory, WorkbenchModuleRegistration, WorkspaceLayoutHandle, WorkspaceStoredState } from '@shared/contracts'
import type { UseCpMakerReturn } from '@features/cp-maker'

export type WorkbenchEnvironment = {
  active: boolean
  desktopHost: boolean
  accentColor: string
  directoryInfo: GameDirectoryInfo | null
  directoryStatus: WorkspaceStatus
  heavyWorkspaceReady: boolean
  onDirectoryInvalid: (message: string) => void
  playerAppearanceProfile: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow: () => void
  onImportModProject: (sourcePath: string) => Promise<void>
  onReloadProject: () => void
  onOpenModule: (moduleId: string) => void
  onOpenProjectProperties: () => void
  onOpenCreateProject: () => void
  onExportProject: () => void
  onCloseProject: () => void
  onOpenGameDirectory: () => void
  onOpenSettings?: (category?: SettingsWindowCategory) => void
}

export type WorkbenchModuleState = {
  moduleId: string
  persistenceKey: string
  layoutRef: RefObject<WorkspaceLayoutHandle | null>
  layouts: Record<string, WorkspaceStoredState>
  onPersistStateChange: (storageKey: string, state: WorkspaceStoredState) => void
  onUnsavedGuardChange: (guard: WorkbenchUnsavedGuard | null) => void
}

export type WorkbenchUnsavedGuard = {
  hasUnsavedChanges: boolean
  hasPendingUnsavedDecision: boolean
  requestUnsavedChangeDecision: (action: () => void | Promise<void>) => Promise<boolean>
}

export type WorkbenchModuleAccess = Pick<WorkbenchModuleRegistration, 'id' | 'presentation' | 'projectAccess'>

const EnvironmentContext = createContext<WorkbenchEnvironment | null>(null)
const ProjectContext = createContext<UseCpMakerReturn | null>(null)
const ModuleStateContext = createContext<WorkbenchModuleState | null>(null)
const ModuleAccessContext = createContext<WorkbenchModuleAccess | null>(null)

export function WorkbenchEnvironmentProvider({ value, children }: { value: WorkbenchEnvironment; children: ReactNode }) {
  return <EnvironmentContext value={value}>{children}</EnvironmentContext>
}

export function WorkbenchProjectProvider({ value, children }: { value: UseCpMakerReturn | null; children: ReactNode }) {
  return <ProjectContext value={value}>{children}</ProjectContext>
}

export function WorkbenchModuleStateProvider({ value, children }: { value: WorkbenchModuleState; children: ReactNode }) {
  return <ModuleStateContext value={value}>{children}</ModuleStateContext>
}

export function WorkbenchModuleAccessProvider({ value, children }: { value: WorkbenchModuleAccess; children: ReactNode }) {
  return <ModuleAccessContext value={value}>{children}</ModuleAccessContext>
}

export function useWorkbenchEnvironment() {
  const value = useContext(EnvironmentContext)
  if (!value) throw new Error('useWorkbenchEnvironment must be used within WorkbenchEnvironmentProvider')
  return value
}

export function useWorkbenchProject() {
  const value = useContext(ProjectContext)
  if (!value) throw new Error('useWorkbenchProject must be used within WorkbenchProjectProvider')
  return value
}

/** Returns the project context when the active module has project access, or null for project-less modules. */
export function useOptionalWorkbenchProject() {
  return useContext(ProjectContext)
}

export function useWorkbenchModuleState() {
  const value = useContext(ModuleStateContext)
  if (!value) throw new Error('useWorkbenchModuleState must be used within WorkbenchModuleStateProvider')
  return value
}

/** Returns the immutable presentation and project access contract of the active module. */
export function useWorkbenchModuleAccess() {
  const value = useContext(ModuleAccessContext)
  if (!value) throw new Error('useWorkbenchModuleAccess must be used within WorkbenchModuleAccessProvider')
  return value
}
