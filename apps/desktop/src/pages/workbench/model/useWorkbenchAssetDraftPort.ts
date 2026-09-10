/**
 * `AssetDraftPort` for workbench modules that render outside the CP Maker edit
 * shell (schedule, mail).
 *
 * The shell builds its port from the props it already threads down; a
 * standalone module has only the project context, so this hook binds the same
 * port to it and adds the one thing the shell owns instead: the async result of
 * a save, surfaced as `saveState` so a page can show saving / saved / failed
 * without inventing its own persistence pipeline.
 *
 * Every edit stages into the draft and only `commit` writes to disk, so all
 * authoring pages share one save policy no matter which host renders them.
 */

import { useEffect, useState } from 'react'
import {
  createAssetDraftPort,
  useDraftUndoShortcuts,
  useAutoSaveDraft,
  type AssetDraftPort,
  type DraftPatch,
  type WorkspaceId,
} from '@features/cp-maker'
import { useWorkbenchProject } from './workbenchModuleContexts'

export type WorkbenchDraftSaveState = 'idle' | 'saving' | 'saved' | 'error'

export type WorkbenchAssetDraftPort = {
  /** Null until a project draft is open; pages render their no-project state then. */
  port: AssetDraftPort | null
  /** Outcome of the most recent `commit`, reset by the next staged edit. */
  saveState: WorkbenchDraftSaveState
  /**
   * Original message of the most recent save failure. Null unless `saveState`
   * is `error` and the save pipeline rejected with an error; cleared by the
   * next staged edit or successful save.
   */
  saveError: string | null
}

/**
 * Binds the draft port to the active project draft for one workspace.
 * `addPatch` lands in `workspaceId`, and switching projects resets both the
 * selected entry and the save state so nothing from the previous draft leaks
 * into the new one.
 *
 * `shortcutsEnabled` is for pages that put an uncommitted form in front of the
 * draft: setting it false while such a form is open keeps Ctrl+Z from stepping
 * a committed operation back underneath it. The buttons stay available.
 */
export function useWorkbenchAssetDraftPort(
  workspaceId: WorkspaceId,
  { shortcutsEnabled = true, onOpenPatch }: { shortcutsEnabled?: boolean; onOpenPatch?: (patchId: string) => void } = {},
): WorkbenchAssetDraftPort {
  const project = useWorkbenchProject()
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<WorkbenchDraftSaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const draftKey = project.activeDraft?.draftStorageKey ?? null

  useEffect(() => {
    setSelectedEntryKey(null)
    setSaveState('idle')
    setSaveError(null)
  }, [draftKey])

  /** Marks the draft as edited: the previous save outcome no longer applies. */
  function markStaged() {
    setSaveState('idle')
    setSaveError(null)
  }

  function stagePatchChange(patchId: string, changes: Partial<DraftPatch>) {
    markStaged()
    project.updatePatch(patchId, changes)
  }

  function stagePatchReorder(patchId: string, delta: -1 | 1, within?: (patch: DraftPatch) => boolean) {
    markStaged()
    project.reorderPatch(patchId, delta, within)
  }

  function stagePatchDuplicate(patchId: string) {
    markStaged()
    project.duplicatePatch(patchId)
  }

  function stagePatchRemove(patchId: string) {
    markStaged()
    project.removePatch(patchId)
  }

  /**
   * The single write path to disk for this port. Auto-save and any explicit
   * commit both go through here so a page can never end up with two save
   * policies racing over the same draft.
   */
  function commitDraft() {
    setSaveState('saving')
    setSaveError(null)
    return project.saveDraft().then(
      (saved) => {
        setSaveState(saved ? 'saved' : 'error')
        if (!saved) setSaveError(null)
      },
      (error) => {
        setSaveState('error')
        setSaveError(error instanceof Error ? error.message : String(error))
      },
    )
  }

  const activeDraft = project.activeDraft
  const port = activeDraft
    ? createAssetDraftPort({
        draft: activeDraft,
        // Standalone modules have no patch list, so an asset resolves to whichever
        // patch of the draft edits it rather than to a shell selection.
        activePatchId: null,
        onPatchChange: stagePatchChange,
        onPatchAdd: (action, target, fromFile) => {
          markStaged()
          return project.addPatch(workspaceId, target, action, fromFile)
        },
        onPatchReorder: stagePatchReorder,
        onPatchDuplicate: stagePatchDuplicate,
        onPatchRemove: stagePatchRemove,
        onAddVirtualAsset: project.addVirtualAsset,
        onRemoveVirtualAsset: project.removeVirtualAsset,
        onOpenPatch,
        onSaveDraft: () => {
          void commitDraft()
        },
        onReloadDraft: () => {
          void project.discardDraftChanges().then(
            () => {
              setSaveState('idle')
              setSaveError(null)
            },
            // A draft that cannot be reloaded keeps its in-memory edits; surfacing
            // the failure is the only honest signal the page can give.
            () => setSaveState('error'),
          )
        },
        isDirty: project.isDirty,
        selectedEntryKey,
        onSelectEntry: setSelectedEntryKey,
      })
    : null

  useDraftUndoShortcuts(shortcutsEnabled ? port : null)

  // Auto-save replaces the per-workspace save buttons the old headers carried.
  // Only runs when a draft is actually open, so a project-less page stays inert.
  useAutoSaveDraft({
    isDirty: activeDraft ? project.isDirty : false,
    onSave: commitDraft,
  })

  return { port, saveState: port ? saveState : 'idle', saveError: port ? saveError : null }
}
