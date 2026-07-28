/**
 * Unified authoring shell for all content workspaces. Replaces EditModeShell
 * and folds the standalone mail/dialogue/schedule headers into a single
 * architecture.
 *
 * Shell structure: AuthoringHeader (nav + undo + save-state + expert toggle) +
 * main content area + ExpertPanel (right drawer, expert mode only).
 *
 * Landing is declarative: workspaceLanding resolves what the user sees on entry.
 * No workspace lands on a patch list; patches are internal.
 */

import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { resolveWorkspaceLanding } from '../model/workspaceLanding'
import { AuthoringHeader } from './AuthoringHeader'
import { ExpertPanel } from './ExpertPanel'
import { EditorPage } from './EditorPage'
import { PatchListPage } from './PatchListPage'
import { TargetPickerDialog } from './TargetPickerDialog'
import type { AssetDraftPort } from '../model/draftPort'
import type { DraftPatch, WorkspaceId } from '../model/types'
import type { EditorResources } from '../model/workspaceRegistry'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type AuthoringShellProps = {
  workspaceId: WorkspaceId
  /** Workspace title for the header (e.g. "建筑工作区"). */
  workspaceTitle: string
  /** Current breadcrumb (entry name or context). */
  breadcrumb?: string | null
  /** Draft port binding for this workspace. */
  draftPort: AssetDraftPort | null
  /** Save state from auto-save. */
  saveState: SaveState
  /** Editor resources (textures, vanilla assets). */
  resources: EditorResources
  /** Navigation history. */
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
  /** Undo/redo from draft port. */
  onUndo: (() => void) | null
  onRedo: (() => void) | null
  /** Project token names for ExpertPanel completion. */
  extraTokenNames?: readonly string[]
  /** Active patch ID for editor routing, null for landing views. */
  activePatchId: string | null
  /** Patch-change callback for ExpertPanel. */
  onPatchChange: (patchId: string, changes: Partial<DraftPatch>) => void
}

export function AuthoringShell({
  workspaceId,
  workspaceTitle,
  breadcrumb = null,
  draftPort,
  saveState,
  resources,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onUndo,
  onRedo,
  extraTokenNames = [],
  activePatchId,
  onPatchChange,
}: AuthoringShellProps) {
  const landing = resolveWorkspaceLanding(workspaceId)
  const [targetPickerOpen, setTargetPickerOpen] = useState(false)

  // Singleton-ensure for asset landings: create the patch if it doesn't exist.
  useEffect(() => {
    if (!draftPort) return
    if (landing.kind === 'asset') {
      const exists = draftPort.draft.patches.some((p) => p.action === landing.action && p.target === landing.target)
      if (!exists) {
        draftPort.addPatch(landing.action, landing.target, undefined)
      }
    }
  }, [draftPort, landing])

  const activePatch = draftPort?.draft.patches.find((p) => p.id === activePatchId) ?? null

  function handleTargetPicked(target: string) {
    if (!draftPort) return
    setTargetPickerOpen(false)
    const action = landing.kind === 'assetGroup' && target.startsWith('Maps/') ? 'EditMap' : 'EditData'
    draftPort.addPatch(action, target, undefined)
  }

  // Route to the appropriate view based on landing + activePatchId.
  let mainContent: ReactElement

  if (activePatchId && activePatch) {
    // Editor view: a patch is open.
    mainContent = <EditorPage workspaceId={workspaceId} patch={activePatch} draftPort={draftPort} resources={resources} />
  } else if (landing.kind === 'asset' && draftPort) {
    // Asset landing: find or create the singleton patch and show its editor.
    const singletonPatch = draftPort.draft.patches.find((p) => p.action === landing.action && p.target === landing.target) ?? null
    mainContent = <EditorPage workspaceId={workspaceId} patch={singletonPatch} draftPort={draftPort} resources={resources} />
  } else if (landing.kind === 'assetGroup') {
    // AssetGroup landing: show the target picker (map until Slice 8 makes it visual).
    mainContent = (
      <div className="flex h-full items-center justify-center">
        <button type="button" className="control-button control-button-primary" onClick={() => setTargetPickerOpen(true)}>
          选择地点
        </button>
      </div>
    )
  } else if (landing.kind === 'module') {
    // Module landing: delegate to the workspace's own main view.
    // Events hub (PatchListPage) is the only one whose save UI we must strip;
    // mail/dialogue/schedule are still rendered by their standalone pages.
    if (workspaceId === 'events' && draftPort) {
      mainContent = (
        <PatchListPage
          patches={draftPort.draft.patches.filter((p) => p.workspace === 'events')}
          onEditPatch={(_patchId) => {
            /* TODO: route to patch editor */
          }}
          onAddPatchRequest={() => {
            /* TODO: open add-event dialog */
          }}
          onRemovePatch={(patchId) => {
            const patch = draftPort.draft.patches.find((p) => p.id === patchId)
            if (patch) {
              draftPort.updatePatch(patchId, { enabled: false })
            }
          }}
          onTogglePatch={(patchId, enabled) => draftPort.updatePatch(patchId, { enabled })}
          onPatchUpdate={(patchId, changes) => draftPort.updatePatch(patchId, changes)}
          onDuplicatePatch={(_patch) => {
            /* TODO: duplicate event */
          }}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
          onOpenConfig={() => {
            /* TODO: open project settings */
          }}
          onSaveDraft={() => {
            /* no-op: auto-save owns persistence */
          }}
          onReloadDraft={() => {
            /* TODO: discard changes */
          }}
          workspaceId="events"
          draft={draftPort.draft}
          isDirty={draftPort.isDirty()}
        />
      )
    } else {
      mainContent = <div className="flex h-full items-center justify-center text-xs text-(--text-secondary)">模块视图尚未绑定到新外壳</div>
    }
  } else if (landing.kind === 'projectContent') {
    // Project content overview: not implemented in Slice 1, placeholder only.
    mainContent = <div className="flex h-full items-center justify-center text-xs text-(--text-secondary)">项目内容总览 (Slice 9)</div>
  } else {
    mainContent = <div className="flex h-full items-center justify-center text-xs text-(--text-secondary)">未知落地模式</div>
  }

  return (
    <div className="authoring-shell">
      <AuthoringHeader
        workspaceTitle={workspaceTitle}
        breadcrumb={breadcrumb}
        saveState={saveState}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
        onUndo={onUndo}
        onRedo={onRedo}
      />

      <div className="authoring-shell-body">
        <main className="authoring-shell-main">{mainContent}</main>

        <ExpertPanel patch={activePatch} extraTokenNames={extraTokenNames} onPatchChange={onPatchChange} />
      </div>

      {landing.kind === 'assetGroup' && targetPickerOpen ? (
        <TargetPickerDialog
          open={targetPickerOpen}
          title="选择地点"
          suggestions={landing.targets}
          confirmLabel="创建"
          onClose={() => setTargetPickerOpen(false)}
          onConfirm={handleTargetPicked}
        />
      ) : null}
    </div>
  )
}
