import { EditModeShell, type WorkspaceId } from '@features/cp-maker'
import { useEditModeNavigation } from '../../model/useEditModeNavigation'
import { useWorkbenchEnvironment, useWorkbenchProject } from '../../model/workbenchModuleContexts'
import { useWorkbenchRuntimeInputs } from './runtimeInputs'

export function AuthoringRuntime({ workspaceId }: { workspaceId: WorkspaceId }) {
  const { locale, theme, copy } = useWorkbenchRuntimeInputs()
  const environment = useWorkbenchEnvironment()
  const project = useWorkbenchProject()
  const navigation = useEditModeNavigation(true)
  const patches = project.getPatchesForWorkspace(workspaceId)
  return (
    <EditModeShell
      workspaceId={workspaceId}
      draft={project.activeDraft}
      patches={patches}
      activePatchId={navigation.activeEditPatchId}
      onSelectPatch={navigation.navigateToPatch}
      onPatchAdd={(action, target, fromFile) => project.addPatch(workspaceId, target, action, fromFile)}
      onPatchRemove={(patchId) => {
        project.removePatch(patchId)
        if (navigation.activeEditPatchId === patchId) navigation.navigateToPatch(null)
      }}
      onPatchUpdate={project.updatePatch}
      onConfigSchemaChange={(entries) => {
        for (const entry of project.configSchema) project.removeConfigEntry(entry.key)
        for (const entry of entries) project.addConfigEntry(entry)
      }}
      onSaveDraft={project.saveDraft}
      onReloadDraft={environment.onReloadProject}
      isDirty={project.isDirty}
      onAddVirtualAsset={project.addVirtualAsset}
      onRemoveVirtualAsset={project.removeVirtualAsset}
      gameRootPath={environment.directoryInfo?.rootPath ?? null}
      directoryInfo={environment.directoryInfo}
      playerAppearanceProfile={environment.playerAppearanceProfile}
      onOpenPlayerAppearanceWindow={environment.onOpenPlayerAppearanceWindow}
      locale={locale}
      theme={theme}
      accentColor={environment.accentColor}
      viewportLabels={copy.viewportLabels}
      canGoBack={navigation.canGoBack}
      canGoForward={navigation.canGoForward}
      onGoBack={navigation.goBack}
      onGoForward={navigation.goForward}
    />
  )
}
