import type { GameDirectoryInfo, WorkspaceId } from '@shared/contracts'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/editor-shell'
import { EditModeShell } from './EditModeShell'
import type { UseGeneratedProjectReturn } from '@features/generated-project'

type EditWorkspaceContentProps = {
  workspaceMode: WorkspaceId
  generatedProject: UseGeneratedProjectReturn
  activeEditPatchId: string | null
  onSelectPatch: (patchId: string | null) => void
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  viewportLabels: ViewportLabels
  directoryInfo?: GameDirectoryInfo | null
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
}

export function EditWorkspaceContent({
  workspaceMode,
  generatedProject,
  activeEditPatchId,
  onSelectPatch,
  locale,
  theme,
  accentColor,
  viewportLabels,
  directoryInfo,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
}: EditWorkspaceContentProps) {
  const workspacePatches = generatedProject.getPatchesForWorkspace(workspaceMode)

  return (
    <EditModeShell
      workspaceId={workspaceMode}
      draft={generatedProject.activeDraft}
      patches={workspacePatches}
      activePatchId={activeEditPatchId}
      onSelectPatch={onSelectPatch}
      onPatchAdd={(action, target, fromFile) => {
        const id = generatedProject.addPatch(workspaceMode, target, action, fromFile)
        onSelectPatch(id)
        return id
      }}
      onPatchRemove={(id) => {
        generatedProject.removePatch(id)
        if (activeEditPatchId === id) {
          onSelectPatch(null)
        }
      }}
      onPatchUpdate={generatedProject.updatePatch}
      onConfigSchemaChange={(entries) => {
        for (const entry of generatedProject.configSchema) {
          generatedProject.removeConfigEntry(entry.key)
        }
        for (const entry of entries) {
          generatedProject.addConfigEntry(entry)
        }
      }}
      onSaveDraft={generatedProject.saveDraft}
      isDirty={generatedProject.isDirty}
      onAddVirtualAsset={generatedProject.addVirtualAsset}
      onRemoveVirtualAsset={generatedProject.removeVirtualAsset}
      gameRootPath={directoryInfo?.rootPath ?? null}
      directoryInfo={directoryInfo}
      locale={locale}
      theme={theme}
      accentColor={accentColor}
      viewportLabels={viewportLabels}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      onGoBack={onGoBack}
      onGoForward={onGoForward}
    />
  )
}
