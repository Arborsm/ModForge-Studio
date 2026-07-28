import { useState } from 'react'
import { AlertTriangle, ArrowLeft, CircleHelp, Copy, Eye, Play, Plus, Save, Terminal, Trash2 } from 'lucide-react'
import { useDialogueEditorCopy } from '@locales/provider'
import { cx, formatCopyTemplate } from '@shared/lib/helper'
import {
  DIALOGUE_COMMAND_ARG_SPECS,
  DialoguePortraitFrame,
  DialogueScriptTokens,
  getPortraitFrameIndex,
  validateDialogueScript,
  type DialogueCommandSegment,
  type DialoguePage,
  type DialoguePageSeparator,
  type DialogueTextSegment,
} from '@entities/dialogue'
import type { UseDialogueWorkspaceReturn } from '../state/useDialogueWorkspace'
import { DialogueEditorSidebar } from './DialogueEditorSidebar'
import { DialogueScriptPreviewDialog } from './DialogueScriptPreviewDialog'
import { getKeyModeLabel } from './dialogueViewHelpers'

function AddPageInline({ onAdd, disabled }: { onAdd: (separator: DialoguePageSeparator) => void; disabled: boolean }) {
  const copy = useDialogueEditorCopy()
  if (disabled) {
    return null
  }

  return (
    <div className="dialogue-editor-add-inline">
      <button type="button" className="control-button dialogue-editor-add-button" onClick={() => onAdd('#$e#')}>
        <Plus className="dialogue-editor-action-icon" />
        {copy.addPageEndAction}
      </button>
      <button type="button" className="control-button dialogue-editor-add-button" onClick={() => onAdd('#$b#')}>
        <Plus className="dialogue-editor-action-icon" />
        {copy.addPageBreakAction}
      </button>
    </div>
  )
}

/** One `$…` segment of a command page, named and broken down by argument. */
function CommandSegmentRow({ segment }: { segment: DialogueCommandSegment }) {
  const copy = useDialogueEditorCopy()
  const specs = DIALOGUE_COMMAND_ARG_SPECS[segment.command]

  return (
    <div className="dialogue-editor-page-card-segment" data-segment="command">
      <span className="dialogue-editor-page-card-segment-label">{copy.commands.commandLabels[segment.command]}</span>
      <div className="dialogue-editor-page-card-segment-args">
        {specs.map((spec, index) => (
          <span key={spec.key} className="dialogue-editor-page-card-segment-arg">
            <span className="dialogue-editor-page-card-segment-arg-label">{copy.commands.commandArgLabels[spec.key]}</span>
            <span className="dialogue-editor-page-card-segment-arg-value">{segment.args[index]?.trim() || '—'}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Speech that follows a command on the same page, with its own portrait frame. */
function SpeechSegmentRow({ segment, workspace }: { segment: DialogueTextSegment; workspace: UseDialogueWorkspaceReturn }) {
  const copy = useDialogueEditorCopy()

  return (
    <div className="dialogue-editor-page-card-segment" data-segment="text">
      {workspace.portrait.url ? (
        <DialoguePortraitFrame
          portrait={workspace.portrait}
          frameIndex={getPortraitFrameIndex(segment.portrait)}
          scale={1}
          className="dialogue-editor-page-card-portrait"
        />
      ) : null}
      <p className={cx('dialogue-editor-page-card-text', !segment.text && 'dialogue-editor-page-card-text-empty')}>
        {segment.text ? <DialogueScriptTokens script={segment.text} /> : copy.textPlaceholder}
      </p>
    </div>
  )
}

function DialoguePageCard({
  page,
  workspace,
  selected,
  warningCount,
}: {
  page: DialoguePage
  workspace: UseDialogueWorkspaceReturn
  selected: boolean
  warningCount: number
}) {
  const copy = useDialogueEditorCopy()
  const readOnly = workspace.draft?.readOnly ?? false
  const canRemove = !readOnly && (workspace.draftAst?.pages.length ?? 0) > 1
  const previewText = page.kind === 'raw' ? page.raw : page.text || page.question?.prompt || ''

  return (
    <article
      className={cx('dialogue-editor-page-card', selected && 'dialogue-editor-page-card-selected')}
      onClick={() => workspace.selectNode(page.id)}
    >
      <header className="dialogue-editor-page-card-head">
        <span className="dialogue-editor-page-card-title">{formatCopyTemplate(copy.pageCardTitleTemplate, { index: page.index + 1 })}</span>
        {page.separatorBefore ? (
          <span className="dialogue-editor-page-card-separator" data-separator={page.separatorBefore === '#$b#' ? 'break' : 'end'}>
            {page.separatorBefore === '#$b#' ? copy.separatorBreakBadge : copy.separatorEndBadge}
          </span>
        ) : null}
        {page.kind === 'question' ? (
          <span className="dialogue-editor-page-card-flag" data-flag="question">
            <CircleHelp className="dialogue-editor-flag-icon" />
            {copy.questionBadge}
          </span>
        ) : null}
        {page.kind === 'command' ? (
          <span className="dialogue-editor-page-card-flag" data-flag="command">
            <Terminal className="dialogue-editor-flag-icon" />
            {copy.commands.commandBadge}
          </span>
        ) : null}
        {page.kind === 'raw' ? (
          <span className="dialogue-editor-page-card-flag" data-flag="raw">
            <Terminal className="dialogue-editor-flag-icon" />
            {copy.rawPageBadge}
          </span>
        ) : null}
        {warningCount > 0 ? (
          <span className="dialogue-editor-page-card-flag" data-flag="warning">
            <AlertTriangle className="dialogue-editor-flag-icon" />
            {warningCount}
          </span>
        ) : null}
        {canRemove ? (
          <button
            type="button"
            className="icon-button dialogue-editor-page-card-remove"
            aria-label={copy.removePageAction}
            title={copy.removePageAction}
            onClick={(event) => {
              event.stopPropagation()
              workspace.deletePage(page.id)
            }}
          >
            <Trash2 className="dialogue-editor-action-icon" />
          </button>
        ) : null}
      </header>
      {page.kind === 'command' ? (
        <div className="dialogue-editor-page-card-segments">
          {page.segments.map((segment) =>
            segment.kind === 'command' ? (
              <CommandSegmentRow key={segment.id} segment={segment} />
            ) : (
              <SpeechSegmentRow key={segment.id} segment={segment} workspace={workspace} />
            ),
          )}
        </div>
      ) : (
        <div className="dialogue-editor-page-card-body">
          {workspace.portrait.url ? (
            <DialoguePortraitFrame
              portrait={workspace.portrait}
              frameIndex={getPortraitFrameIndex(page.portrait)}
              scale={1}
              className="dialogue-editor-page-card-portrait"
            />
          ) : null}
          <p className={cx('dialogue-editor-page-card-text', !previewText && 'dialogue-editor-page-card-text-empty')}>
            {previewText ? <DialogueScriptTokens script={previewText} /> : copy.textPlaceholder}
          </p>
        </div>
      )}
      {page.question ? (
        <footer className="dialogue-editor-page-card-branches">
          {page.question.responses.map((response, index) => (
            <div key={response.id} className="dialogue-editor-page-card-branch">
              <span className="dialogue-editor-page-card-branch-title">
                {formatCopyTemplate(copy.commands.branchTitleTemplate, { index: index + 1 })}
              </span>
              <span className="dialogue-editor-page-card-branch-text">
                {response.text ? <DialogueScriptTokens script={response.text} /> : copy.responseTextPlaceholder}
              </span>
              {response.resultKey ? <span className="dialogue-editor-page-card-branch-key">{response.resultKey}</span> : null}
            </div>
          ))}
        </footer>
      ) : null}
    </article>
  )
}

/** Full-page dialogue editor: header, vertical page-flow canvas, and properties sidebar. */
export function DialogueEditorView({ workspace }: { workspace: UseDialogueWorkspaceReturn }) {
  const copy = useDialogueEditorCopy()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const { draft, draftAst, draftKey, isDraftDirty } = workspace

  if (!draft || !draftAst) {
    return null
  }

  const warnings = validateDialogueScript(draft.script)
  const npcDisplayName = workspace.npcs.find((npc) => npc.id === draft.npcId)?.displayName ?? draft.npcId
  const headerTitle = draft.title.trim() || (draft.originalKey ?? (draftKey || copy.newEntryTitle))
  const selectedPage = draftAst.pages.find((page) => page.id === draft.selectedNodeId) ?? null

  function handleBack() {
    if (isDraftDirty && !confirmingDiscard) {
      setConfirmingDiscard(true)
      return
    }
    workspace.closeEditor()
  }

  return (
    <div className="dialogue-editor">
      <header className="dialogue-editor-topbar">
        <div className="dialogue-editor-topbar-lead">
          <button
            type="button"
            className={cx('control-button', confirmingDiscard && 'dialogue-editor-entry-action-danger')}
            onClick={handleBack}
            onBlur={() => setConfirmingDiscard(false)}
          >
            <ArrowLeft className="dialogue-editor-action-icon" />
            {confirmingDiscard ? copy.discardChangesAction : copy.backToList}
          </button>
          <div className="dialogue-editor-topbar-heading">
            <p className="dialogue-editor-topbar-title">{headerTitle}</p>
            <p className="dialogue-editor-breadcrumb">
              <span>{npcDisplayName}</span>
              <span className="dialogue-editor-breadcrumb-sep">/</span>
              <span>{getKeyModeLabel(copy, draft.keyBuild.mode)}</span>
              <span className="dialogue-editor-breadcrumb-sep">/</span>
              <span className="dialogue-editor-breadcrumb-key">{draftKey || '—'}</span>
            </p>
          </div>
        </div>
        <div className="dialogue-editor-topbar-actions">
          {draft.readOnly ? (
            <>
              <span className="dialogue-editor-readonly-badge">
                <Eye className="dialogue-editor-action-icon" />
                {copy.readOnlyBadge}
              </span>
              <button type="button" className="control-button control-button-primary" onClick={workspace.copyDraftToProject}>
                <Copy className="dialogue-editor-action-icon" />
                {copy.copyToProjectAction}
              </button>
            </>
          ) : (
            <span className={cx('dialogue-editor-save-status', isDraftDirty && 'dialogue-editor-save-status-dirty')}>
              {isDraftDirty ? copy.unsavedStatus : copy.savedStatus}
            </span>
          )}
          <button type="button" className="control-button" onClick={() => setPreviewOpen(true)}>
            <Eye className="dialogue-editor-action-icon" />
            {copy.previewScriptAction}
          </button>
          {!draft.readOnly ? (
            <button
              type="button"
              className="control-button control-button-primary"
              onClick={workspace.saveEntry}
              disabled={!draftKey || !isDraftDirty}
            >
              <Save className="dialogue-editor-action-icon" />
              {copy.saveAction}
            </button>
          ) : null}
        </div>
      </header>

      <div className="dialogue-editor-editor-body">
        <section className="dialogue-editor-canvas custom-scrollbar">
          <div className="dialogue-editor-flow">
            <article
              className={cx('dialogue-editor-start-card', draft.selectedNodeId === 'start' && 'dialogue-editor-page-card-selected')}
              onClick={() => workspace.selectNode('start')}
            >
              <header className="dialogue-editor-page-card-head">
                <span className="dialogue-editor-start-card-icon">
                  <Play className="dialogue-editor-action-icon" />
                </span>
                <span className="dialogue-editor-page-card-title">{copy.canvasStartTitle}</span>
              </header>
              <p className="dialogue-editor-start-card-meta">
                <span>{npcDisplayName}</span>
                <span className="dialogue-editor-breadcrumb-sep">·</span>
                <span>{getKeyModeLabel(copy, draft.keyBuild.mode)}</span>
                <span className="dialogue-editor-breadcrumb-sep">·</span>
                <span className="dialogue-editor-breadcrumb-key">{draftKey || '—'}</span>
              </p>
              <p className="dialogue-editor-start-card-hint">{copy.canvasStartHint}</p>
            </article>

            {draftAst.pages.map((page) => (
              <div key={page.id} className="dialogue-editor-flow-step">
                <span className="dialogue-editor-connector" aria-hidden="true" />
                <DialoguePageCard
                  page={page}
                  workspace={workspace}
                  selected={draft.selectedNodeId === page.id}
                  warningCount={warnings.filter((warning) => warning.pageIndex === page.index).length}
                />
                <AddPageInline onAdd={(separator) => workspace.addPage(page.id, separator)} disabled={draft.readOnly} />
              </div>
            ))}
          </div>
        </section>

        <DialogueEditorSidebar workspace={workspace} selectedPage={selectedPage} warnings={warnings} />
      </div>

      <DialogueScriptPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        script={draft.script}
        npcDisplayName={npcDisplayName}
        entryKey={draftKey || (draft.originalKey ?? '')}
      />
    </div>
  )
}
