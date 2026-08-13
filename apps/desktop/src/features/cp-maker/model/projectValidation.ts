/**
 * Project-wide validation roll-up.
 *
 * Every authoring page validates its own asset, but the dashboard needs one
 * number for "things that will break the pack". This module runs the same
 * validators the pages run — the event validator for `Data/Events/*`, the
 * registered `AssetSchema` for everything with a structured editor — and counts
 * their `AssetIssue`s, so a badge on the desk and a badge in the editor can
 * never disagree.
 *
 * Patches the author switched off are skipped: they are not exported, so their
 * findings are not the project's problem.
 */

import { getAssetSchema, parseAssetEditorState, validateAssetEntries, type AssetIssue } from '@entities/asset-schema'
import { buildEventPatchHubPatches, isEventAssetTarget } from '@entities/event'
import { readAdvancedFields, readReplacedEntryKeys, readTextOperations } from './editDataAdvancedOps'
import { collectManifestIssues } from './manifestValidation'
import { collectTopLevelIssues } from './topLevelValidation'
import type { CpMakerDraft } from './types'
import type { DraftPatch } from './types'

/** Actions whose whole point is shipping a file; without one they patch nothing. */
const FILE_BACKED_ACTIONS = new Set<DraftPatch['action']>(['EditImage', 'Load', 'Include'])

function isPatchEnabled(patch: DraftPatch): boolean {
  return patch.enabled !== false
}

function collectFileIssues(patch: DraftPatch): AssetIssue[] {
  if (!FILE_BACKED_ACTIONS.has(patch.action) || (patch.fromFile ?? '').trim() !== '') {
    return []
  }
  return [
    {
      severity: 'error',
      code: 'patchSourceFileMissing',
      messageKey: 'patch.sourceFileMissing',
      path: [patch.target || patch.id],
      params: { action: patch.action, target: patch.target },
    },
  ]
}

/**
 * Warns when a patch replaces an entry wholesale (`entries`) and also targets
 * the same entry through `fields` or a `TextOperations` path: the wholesale
 * replacement wins and the finer edit silently does nothing.
 */
function collectEditDataOverlapIssues(patch: DraftPatch): AssetIssue[] {
  if (patch.action !== 'EditData') return []
  const replaced = new Set(readReplacedEntryKeys(patch.editorState).map((key) => key.toLowerCase()))
  if (replaced.size === 0) return []

  const issues: AssetIssue[] = []
  for (const entryKey of Object.keys(readAdvancedFields(patch.editorState))) {
    if (replaced.has(entryKey.toLowerCase())) {
      issues.push({
        severity: 'warning',
        code: 'editDataFieldsOverlapEntries',
        messageKey: 'editData.fieldsOverlapEntries',
        path: [patch.target, entryKey],
        params: { entryKey },
      })
    }
  }
  for (const op of readTextOperations(patch.editorState)) {
    const match = op.target.match(/^\/?Entries\/([^/]+)/i)
    const entryKey = match?.[1]
    if (entryKey !== undefined && replaced.has(entryKey.toLowerCase())) {
      issues.push({
        severity: 'warning',
        code: 'editDataTextOpOverlapsEntries',
        messageKey: 'editData.textOpOverlapsEntries',
        path: [patch.target, op.target],
        params: { entryKey },
      })
    }
  }
  return issues
}

/**
 * Collects the findings of every enabled patch in the project, in patch order.
 * Event patches are validated together so duplicated event keys surface.
 */
export function collectProjectIssues(patches: readonly DraftPatch[]): AssetIssue[] {
  const enabled = patches.filter(isPatchEnabled)
  const eventPatches = enabled.filter((patch) => patch.action === 'EditData' && isEventAssetTarget(patch.target))
  const issues: AssetIssue[] = buildEventPatchHubPatches(eventPatches).flatMap((hub) =>
    hub.events.filter((event) => event.status !== 'disabled').flatMap((event) => event.issues),
  )

  for (const patch of enabled) {
    issues.push(...collectFileIssues(patch))
    issues.push(...collectEditDataOverlapIssues(patch))
    if (patch.action !== 'EditData' || isEventAssetTarget(patch.target)) continue
    const schema = getAssetSchema(patch.target)
    if (schema === undefined) continue
    issues.push(...validateAssetEntries(schema, parseAssetEditorState(patch.editorState).entries))
  }

  return issues
}

/**
 * Whole-draft roll-up: manifest findings first (they block SMAPI load), then
 * the top-level content.json structures, then every enabled patch's findings.
 */
export function collectDraftIssues(draft: CpMakerDraft): AssetIssue[] {
  return [...collectManifestIssues(draft.projectMetadata), ...collectTopLevelIssues(draft), ...collectProjectIssues(draft.patches)]
}
