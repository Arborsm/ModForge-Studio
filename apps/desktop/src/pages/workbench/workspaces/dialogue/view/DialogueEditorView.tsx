import { useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  Copy,
  Eye,
  Play,
  Plus,
  Save,
  Terminal,
  Trash2,
} from 'lucide-react'
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

type DialogueEditorTab = 'flow' | 'properties' | 'script'

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
  const [activeTab, setActiveTab] = useState<DialogueEditorTab>('flow')
  const { draft, draftAst, draftKey, isDraftDirty } = workspace

  if (!draft || !draftAst) {
    return null
  }

  const warnings = validateDialogueScript(draft.script)
  const npcDisplayName = workspace.npcs.find((npc) => npc.id === draft.npcId)?.displayName ?? draft.npcId
  const headerTitle = draft.title.trim() || (draft.originalKey ?? (draftKey || copy.newEntryTitle))
  const selectedPage = draftAst.pages.find((page) => page.id === draft.selectedNodeId) ?? null
  const previewText = selectedPage
    ? selectedPage.kind === 'raw'
      ? selectedPage.raw
      : selectedPage.kind === 'command'
        ? selectedPage.segments
            .filter((segment): segment is DialogueTextSegment => segment.kind === 'text')
            .map((segment) => segment.text)
            .filter(Boolean)
            .join(' ')
        : selectedPage.text || selectedPage.question?.prompt || ''
    : ''
  const previewPortrait = selectedPage
    ? selectedPage.kind === 'command'
      ? selectedPage.segments.find((segment): segment is DialogueTextSegment => segment.kind === 'text')?.portrait
      : selectedPage.kind === 'raw'
        ? undefined
        : selectedPage.portrait
    : undefined
  const tabStatuses: Record<DialogueEditorTab, 'complete' | 'attention' | 'optional'> = {
    flow: warnings.length > 0 ? 'attention' : 'complete',
    properties: draftKey && !workspace.isDraftKeyDuplicate ? 'complete' : 'attention',
    script: draft.script.trim() ? 'complete' : 'attention',
  }

  function handleBack() {
    if (isDraftDirty && !confirmingDiscard) {
      setConfirmingDiscard(true)
      return
    }
    workspace.closeEditor()
  }

  return (
    <div className="dialogue-editor">
      <div className="dialogue-editor-focused-layout">
        <section className="dialogue-editor-focused-main">
          <nav className="dialogue-editor-tabs" aria-label={copy.title}>
            <button
              type="button"
              className={cx('dialogue-editor-tab-back', confirmingDiscard && 'is-danger')}
              title={confirmingDiscard ? copy.discardChangesAction : copy.backToList}
              aria-label={confirmingDiscard ? copy.discardChangesAction : copy.backToList}
              onClick={handleBack}
              onBlur={() => setConfirmingDiscard(false)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            {(['flow', 'properties', 'script'] as DialogueEditorTab[]).map((tab) => {
              const status = tabStatuses[tab]
              const StatusIcon = status === 'complete' ? CheckCircle2 : status === 'attention' ? AlertCircle : CircleDashed
              return (
                <button
                  key={tab}
                  type="button"
                  className={cx('dialogue-editor-tab', activeTab === tab && 'is-active', `is-${status}`)}
                  onClick={() => setActiveTab(tab)}
                >
                  <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{copy.editorTabs[tab]}</span>
                  <span className="sr-only">{copy.tabStatuses[status]}</span>
                </button>
              )
            })}
          </nav>

          <div className="dialogue-editor-workbar">
            <div className="dialogue-editor-workbar-title">
              <strong>{headerTitle}</strong>
              <span>
                {npcDisplayName} / {getKeyModeLabel(copy, draft.keyBuild.mode)} / {draftKey || '—'}
              </span>
            </div>
            <div className="dialogue-editor-workbar-actions">
              {draft.readOnly ? (
                <button type="button" className="control-button control-button-primary" onClick={workspace.copyDraftToProject}>
                  <Copy className="dialogue-editor-action-icon" />
                  {copy.copyToProjectAction}
                </button>
              ) : (
                <>
                  <span className={cx('dialogue-editor-save-status', isDraftDirty && 'dialogue-editor-save-status-dirty')}>
                    {isDraftDirty ? copy.unsavedStatus : copy.savedStatus}
                  </span>
                  <button
                    type="button"
                    className="control-button control-button-primary"
                    onClick={workspace.saveEntry}
                    disabled={!draftKey || !isDraftDirty}
                  >
                    <Save className="dialogue-editor-action-icon" />
                    {copy.saveAction}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="dialogue-editor-tab-content">
            {activeTab === 'flow' ? (
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
            ) : activeTab === 'properties' ? (
              <div className="dialogue-editor-properties-pane">
                <DialogueEditorSidebar workspace={workspace} selectedPage={selectedPage} warnings={warnings} />
              </div>
            ) : (
              <div className="dialogue-editor-script-pane">
                <p>{copy.rawScriptHint}</p>
                <textarea
                  className="control-input dialogue-editor-script-textarea"
                  value={draft.script}
                  readOnly={draft.readOnly}
                  spellCheck={false}
                  onChange={(event) => workspace.updateDraft({ script: event.target.value })}
                />
                <button type="button" className="control-button" onClick={() => setPreviewOpen(true)}>
                  <Eye className="dialogue-editor-action-icon" />
                  {copy.previewScriptAction}
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="dialogue-editor-live-preview">
          <header>
            <div>
              <strong>{copy.livePreviewTitle}</strong>
              <span>{npcDisplayName}</span>
            </div>
            {draft.readOnly ? <span className="dialogue-editor-readonly-badge">{copy.readOnlyBadge}</span> : null}
          </header>
          <div className="dialogue-editor-live-preview-body">
            {selectedPage ? (
              <div className="dialogue-editor-live-bubble">
                {workspace.portrait.url ? (
                  <DialoguePortraitFrame
                    portrait={workspace.portrait}
                    frameIndex={getPortraitFrameIndex(previewPortrait ?? { kind: 'none' })}
                    scale={2}
                    className="dialogue-editor-live-portrait"
                  />
                ) : null}
                <strong>{npcDisplayName}</strong>
                <p>{previewText ? <DialogueScriptTokens script={previewText} /> : copy.textPlaceholder}</p>
              </div>
            ) : (
              <div className="dialogue-editor-live-empty">
                <Play className="h-6 w-6" />
                <span>{copy.livePreviewEmpty}</span>
              </div>
            )}
          </div>
          <div className="dialogue-editor-live-data">
            <strong>{copy.previewDataTitle}</strong>
            <dl>
              <div>
                <dt>{copy.previewNpcLabel}</dt>
                <dd>{draft.npcId}</dd>
              </div>
              <div>
                <dt>{copy.previewKeyLabel}</dt>
                <dd>{draftKey || '—'}</dd>
              </div>
              <div>
                <dt>{copy.previewPagesLabel}</dt>
                <dd>{draftAst.pages.length}</dd>
              </div>
              <div>
                <dt>{copy.previewWarningsLabel}</dt>
                <dd>{warnings.length}</dd>
              </div>
            </dl>
          </div>
        </aside>
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
