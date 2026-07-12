import type { RefObject } from 'react'
import { WorkspaceLayout } from '@shared/workspace'
import type { WorkspaceLayoutHandle, WorkspacePanelConfig } from '@shared/contracts'
import type { WorkspaceStoredState } from '@shared/contracts'

type WorkbenchLayoutHostProps = {
  workspaceLayoutRef: RefObject<WorkspaceLayoutHandle | null>
  workspaceLayoutStorageKey: string
  workspaceLayouts: Record<string, WorkspaceStoredState>
  workspacePanels: WorkspacePanelConfig[]
  onPersistStateChange: (storageKey: string, state: WorkspaceStoredState) => void
}

export function WorkbenchLayoutHost({
  workspaceLayoutRef,
  workspaceLayoutStorageKey,
  workspaceLayouts,
  workspacePanels,
  onPersistStateChange,
}: WorkbenchLayoutHostProps) {
  return (
    <WorkspaceLayout
      ref={workspaceLayoutRef}
      storageKey={workspaceLayoutStorageKey}
      panels={workspacePanels}
      persistedState={workspaceLayouts[workspaceLayoutStorageKey] ?? null}
      onPersistStateChange={onPersistStateChange}
    />
  )
}
