import type { GameDirectoryInfo, WorkspaceId } from '@shared/contracts'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/editor-shell'
import { EditModeShell } from './EditModeShell'
import type { UseCpMakerReturn } from '@features/cp-maker'

type EditWorkspaceContentProps = {
  workspaceMode: WorkspaceId
  cpMaker: UseCpMakerReturn
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
  cpMaker,
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
  const workspacePatches = cpMaker.getPatchesForWorkspace(workspaceMode)

  return (
    <EditModeShell
      workspaceId={workspaceMode}
      draft={cpMaker.activeDraft}
      patches={workspacePatches}
      activePatchId={activeEditPatchId}
      onSelectPatch={onSelectPatch}
      onPatchAdd={(action, target, fromFile) => {
        const id = cpMaker.addPatch(workspaceMode, target, action, fromFile)
        onSelectPatch(id)
        return id
      }}
      onPatchRemove={(id) => {
        cpMaker.removePatch(id)
        if (activeEditPatchId === id) {
          onSelectPatch(null)
        }
      }}
      onPatchUpdate={cpMaker.updatePatch}
      onConfigSchemaChange={(entries) => {
        for (const entry of cpMaker.configSchema) {
          cpMaker.removeConfigEntry(entry.key)
        }
        for (const entry of entries) {
          cpMaker.addConfigEntry(entry)
        }
      }}
      onSaveDraft={cpMaker.saveDraft}
      isDirty={cpMaker.isDirty}
      onAddVirtualAsset={cpMaker.addVirtualAsset}
      onRemoveVirtualAsset={cpMaker.removeVirtualAsset}
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
