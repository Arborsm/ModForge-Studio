/**
 * @file Editor route page: resolves the registered workspace editor for a patch
 * and passes its `AssetSchema`.
 * @module features/cp-maker
 */

import { getAssetSchema } from '@entities/asset-schema'
import { useEditorCopy } from '@locales/provider'
import type { AssetDraftPort } from '../model/draftPort'
import type { DraftPatch, WorkspaceId } from '../model/types'
import { getWorkspacePlugin, type EditorResources } from '../model/workspaceRegistry'

interface EditorPageProps {
  workspaceId: WorkspaceId
  patch: DraftPatch | null
  draftPort: AssetDraftPort | null
  resources: EditorResources
}

/** Renders the workspace-registered editor for a patch, or a fallback when none is registered. */
export function EditorPage({ workspaceId, patch, draftPort, resources }: EditorPageProps) {
  const copy = useEditorCopy().studioDesk.editorPage

  if (!patch || !draftPort) {
    return <div className="text-text-secondary flex h-full items-center justify-center text-xs">{copy.patchNotFound}</div>
  }

  const Editor = getWorkspacePlugin(workspaceId)?.editMode.editor

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        {Editor ? (
          <Editor patch={patch} schema={getAssetSchema(patch.target) ?? null} draftPort={draftPort} resources={resources} />
        ) : (
          <div className="text-text-secondary flex h-full items-center justify-center text-xs">{copy.noEditorRegistered(workspaceId)}</div>
        )}
      </div>
    </div>
  )
}
