import { AuthoringShell, type WorkspaceId } from '@features/cp-maker'
import { useEditorCopy } from '@locales/provider'
import { useWorkbenchAssetDraftPort } from '../../model/useWorkbenchAssetDraftPort'
import { useEditModeNavigation } from '../../model/useEditModeNavigation'
import { useWorkbenchEnvironment, useWorkbenchProject } from '../../model/workbenchModuleContexts'
import { useWorkbenchRuntimeInputs } from './runtimeInputs'
import { useEffect } from 'react'

function normalizeTarget(target: string): string {
  return target.trim().replaceAll('\\', '/').toLowerCase()
}

export type AuthoringRuntimeProps = {
  workspaceId: WorkspaceId
  /**
   * `EditData` asset a cross-module jump asked to open, e.g. `Data/Objects`.
   * The runtime selects the workspace patch that already edits it, or adds one,
   * so a jump from a codex page lands in an editor instead of the patch list.
   */
  pendingAssetTarget?: string | null
  /** Called once the patch for `pendingAssetTarget` is selected. */
  onPendingAssetTargetOpened?: () => void
}

export function AuthoringRuntime({ workspaceId, pendingAssetTarget = null, onPendingAssetTargetOpened }: AuthoringRuntimeProps) {
  const { locale, theme } = useWorkbenchRuntimeInputs()
  const copy = useEditorCopy()
  const environment = useWorkbenchEnvironment()
  const project = useWorkbenchProject()
  const navigation = useEditModeNavigation(true)
  const patches = project.getPatchesForWorkspace(workspaceId)
  const { port, saveState } = useWorkbenchAssetDraftPort(workspaceId)

  const { navigateToPatch } = navigation
  const { addPatch, activeDraft } = project
  useEffect(() => {
    if (pendingAssetTarget === null || activeDraft === null) {
      return
    }
    const normalized = normalizeTarget(pendingAssetTarget)
    const existing = patches.find((patch) => patch.action === 'EditData' && normalizeTarget(patch.target) === normalized)
    if (existing) {
      navigateToPatch(existing.id)
      onPendingAssetTargetOpened?.()
      return
    }
    // Ensure the patch first; the next render finds it in `patches` and opens
    // it. Trusting a synchronously returned id is unsafe under effect
    // double-invocation, while the dedupe inside addPatch prevents duplicates.
    addPatch(workspaceId, pendingAssetTarget, 'EditData')
  }, [pendingAssetTarget, activeDraft, patches, workspaceId, addPatch, navigateToPatch, onPendingAssetTargetOpened])

  const workspaceLabel = workspaceId === 'mods' ? '模组' : copy.studioDesk.referencePreview.workspaceLabels[workspaceId]
  const workspaceTitle = workspaceId === 'mods' ? '项目内容' : `${workspaceLabel}工作区`

  // Breadcrumb: patch logName when editing, null otherwise
  const activePatch = patches.find((p) => p.id === navigation.activeEditPatchId) ?? null
  const breadcrumb = activePatch ? activePatch.logName || activePatch.target : null

  // Resources: subset that shell binds — real gameRootPath, directoryInfo,
  // playerAppearanceProfile, appearance window callback, locale, theme, accent.
  const resources = {
    gameRootPath: environment.directoryInfo?.rootPath ?? null,
    directoryInfo: environment.directoryInfo ?? null,
    playerAppearanceProfile: environment.playerAppearanceProfile ?? null,
    onOpenPlayerAppearanceWindow: environment.onOpenPlayerAppearanceWindow,
    locale,
    theme,
    accentColor: environment.accentColor,
  }

  return (
    <AuthoringShell
      workspaceId={workspaceId}
      workspaceTitle={workspaceTitle}
      breadcrumb={breadcrumb}
      draftPort={port}
      saveState={saveState}
      resources={resources}
      canGoBack={navigation.canGoBack}
      canGoForward={navigation.canGoForward}
      onGoBack={navigation.goBack}
      onGoForward={navigation.goForward}
      onUndo={port?.undo ?? null}
      onRedo={port?.redo ?? null}
      extraTokenNames={[]}
      activePatchId={navigation.activeEditPatchId}
      onPatchChange={project.updatePatch}
    />
  )
}
