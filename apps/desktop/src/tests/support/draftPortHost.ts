/**
 * In-memory host for `AssetDraftPort` unit tests.
 *
 * The port closes over one render's draft, so a test that stages and then reads
 * has to rebuild it the way a re-render would. `port()` does exactly that over
 * the mutated draft, keeping the tests honest about what a page actually sees.
 */

import { createAssetDraftPort, type AssetDraftPort, type CpMakerDraft, type DraftPatch } from '@features/cp-maker'

/** Minimal draft carrying only what the port reads: the patch list. */
export function makeTestDraft(storageKey: string, patches: DraftPatch[]): CpMakerDraft {
  return {
    draftStorageKey: storageKey,
    projectMetadata: {
      projectName: 'Test',
      projectDescription: '',
      projectAuthor: '',
      projectVersion: '1.0.0',
      projectUniqueId: 'Test.Mod',
      gameRootPath: null,
      contentPackForUniqueId: 'Pathoschild.ContentPatcher',
    },
    configSchema: [],
    patches,
    virtualAssets: [],
    dynamicTokens: [],
    customLocations: [],
    aliasTokenNames: {},
    eventSourceSnapshotsByTarget: {},
    i18nFiles: [],
  }
}

/** Builds an `EditData` patch; pass `action` for the other patch kinds. */
export function makeTestPatch(id: string, target: string, editorState: unknown, patch: Partial<DraftPatch> = {}): DraftPatch {
  return { id, workspace: 'mods', target, action: 'EditData', logName: '', enabled: true, editorState, ...patch }
}

export type DraftPortHost = {
  /** Save/reload calls the port made, in order. */
  log: string[]
  /** A port bound to the current draft, as the next render would build it. */
  port: () => AssetDraftPort
  /** Raw editor state of a patch, for asserting the persisted shape. */
  editorState: (patchId: string) => unknown
  patches: () => DraftPatch[]
}

/** Mounts a port over a mutable draft seeded with `patches`. `storageKey` names the draft the undo history is scoped to. */
export function mountDraftPort(patches: DraftPatch[], storageKey = 'draft-a'): DraftPortHost {
  const log: string[] = []
  const initial = patches.map((patch) => ({ ...patch }))
  let draft = makeTestDraft(storageKey, patches)
  let dirty = false

  function build(): AssetDraftPort {
    return createAssetDraftPort({
      draft,
      activePatchId: null,
      onPatchChange: (patchId, changes) => {
        dirty = true
        draft = { ...draft, patches: draft.patches.map((patch) => (patch.id === patchId ? { ...patch, ...changes } : patch)) }
      },
      onPatchAdd: (action, target) => {
        dirty = true
        const id = `patch-${draft.patches.length + 1}`
        draft = { ...draft, patches: [...draft.patches, makeTestPatch(id, target, {}, { action })] }
        return id
      },
      onAddVirtualAsset: () => {},
      onRemoveVirtualAsset: () => {},
      onSaveDraft: () => {
        log.push('commit')
        dirty = false
      },
      onReloadDraft: () => {
        log.push('revert')
        draft = makeTestDraft(
          draft.draftStorageKey,
          initial.map((patch) => ({ ...patch })),
        )
        dirty = false
      },
      isDirty: dirty,
      selectedEntryKey: null,
      onSelectEntry: () => {},
    })
  }

  return {
    log,
    port: build,
    editorState: (patchId) => draft.patches.find((patch) => patch.id === patchId)?.editorState,
    patches: () => draft.patches,
  }
}
