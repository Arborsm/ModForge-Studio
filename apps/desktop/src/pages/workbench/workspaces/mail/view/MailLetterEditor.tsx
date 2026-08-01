import { useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  AtSign,
  ChefHat,
  CheckCircle2,
  CircleDashed,
  CornerDownLeft,
  Gift,
  Hammer,
  ScrollText,
  Users,
  X,
} from 'lucide-react'
import { DraftUndoButtons, ExpertModeButton } from '@features/cp-maker'
import { useMailEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useMailWorkspaceContext } from '../state/MailWorkspaceContext'
import { type MailAttachment, type MailAttachmentKind } from '../entities/mail'
import { MailAttachmentDialog, MailGenderSplitDialog, MailLocalizedTextPicker } from './MailEditorDialogs'
import { MailDeliverySection } from './MailDeliverySection'
import { MailInfoSidebar } from './MailInfoSidebar'
import { fillTemplate, formatAttachmentChip } from './mailCopyHelpers'

type MailEditorTab = 'body' | 'attachments' | 'delivery' | 'settings'

function AttachmentChips() {
  const copy = useMailEditorCopy()
  const workspace = useMailWorkspaceContext()
  const draft = workspace.activeDraft
  if (!draft) {
    return null
  }

  return (
    <div className="mail-editor-section">
      <span className="mail-editor-field-label">{copy.editor.attachmentsLabel}</span>
      {draft.attachments.length === 0 ? (
        <p className="mail-editor-muted">{copy.editor.attachmentsEmpty}</p>
      ) : (
        <div className="mail-editor-attachment-chips">
          {draft.attachments.map((attachment, index) => (
            <span key={index} className="mail-editor-attachment-chip" data-kind={attachment.attachment.kind}>
              <span className="mail-editor-attachment-chip-label">{formatAttachmentChip(attachment.attachment, copy.attachments)}</span>
              <button
                type="button"
                className="mail-editor-attachment-chip-remove"
                aria-label={copy.editor.removeAttachmentLabel}
                onClick={() =>
                  workspace.updateActiveDraft({
                    ...draft,
                    attachments: draft.attachments.filter((_, candidate) => candidate !== index),
                  })
                }
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      {draft.actions.length > 0 ? (
        <p className="mail-editor-muted">{fillTemplate(copy.editor.actionsPreservedTemplate, { count: draft.actions.length })}</p>
      ) : null}
    </div>
  )
}

/** Focused mail editor: compact status tabs, central controls, and shared dialogs. */
export function MailLetterEditor() {
  const copy = useMailEditorCopy()
  const workspace = useMailWorkspaceContext()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [attachmentDialog, setAttachmentDialog] = useState<{ open: boolean; kind: MailAttachmentKind }>({ open: false, kind: 'id' })
  const [genderDialogOpen, setGenderDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<MailEditorTab>('body')
  const draft = workspace.activeDraft

  if (!draft || workspace.activeMailId === null) {
    return (
      <section className="mail-editor-main">
        <div className="mail-editor-empty">
          <p className="mail-editor-empty-title">{copy.editor.noSelectionTitle}</p>
          <p className="mail-editor-empty-hint">{copy.editor.noSelectionHint}</p>
        </div>
      </section>
    )
  }

  function insertIntoBody(snippet: string) {
    if (!draft) {
      return
    }
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? draft.body.length
    const end = textarea?.selectionEnd ?? draft.body.length
    workspace.updateActiveDraft({ ...draft, body: `${draft.body.slice(0, start)}${snippet}${draft.body.slice(end)}` })
    requestAnimationFrame(() => {
      const node = textareaRef.current
      if (node) {
        node.focus()
        node.setSelectionRange(start + snippet.length, start + snippet.length)
      }
    })
  }

  function appendAttachment(attachment: MailAttachment) {
    if (draft) {
      workspace.updateActiveDraft({ ...draft, attachments: [...draft.attachments, { raw: null, attachment }] })
    }
  }

  const bodyActions: Array<{ key: string; label: string; icon: typeof AtSign; onClick: () => void }> = [
    { key: 'player', label: copy.editor.insertPlayerName, icon: AtSign, onClick: () => insertIntoBody('@') },
    { key: 'break', label: copy.editor.insertLineBreak, icon: CornerDownLeft, onClick: () => insertIntoBody('^') },
    { key: 'gender', label: copy.editor.insertGenderSplit, icon: Users, onClick: () => setGenderDialogOpen(true) },
  ]
  const attachmentActions: Array<{ key: string; label: string; icon: typeof AtSign; onClick: () => void }> = [
    { key: 'attachment', label: copy.editor.insertAttachment, icon: Gift, onClick: () => setAttachmentDialog({ open: true, kind: 'id' }) },
    {
      key: 'cooking',
      label: copy.editor.insertCookingRecipe,
      icon: ChefHat,
      onClick: () => setAttachmentDialog({ open: true, kind: 'cookingRecipe' }),
    },
    {
      key: 'crafting',
      label: copy.editor.insertCraftingRecipe,
      icon: Hammer,
      onClick: () => setAttachmentDialog({ open: true, kind: 'craftingRecipe' }),
    },
    {
      key: 'quest',
      label: copy.editor.insertQuest,
      icon: ScrollText,
      onClick: () => setAttachmentDialog({ open: true, kind: 'quest' }),
    },
  ]
  const hasErrors = workspace.activeIssues.some((issue) => issue.severity === 'error')
  const tabStatuses: Record<MailEditorTab, 'complete' | 'attention' | 'optional'> = {
    body: draft.body.trim() ? 'complete' : 'attention',
    attachments: draft.attachments.length > 0 ? 'complete' : 'optional',
    delivery: workspace.activeTriggers.length > 0 ? 'complete' : 'attention',
    settings: hasErrors || workspace.activeMailId.trim() === '' ? 'attention' : 'complete',
  }
  const saveStatusText =
    workspace.saveState === 'saving'
      ? copy.savingStatus
      : workspace.saveState === 'saved'
        ? copy.savedStatus
        : workspace.saveState === 'error'
          ? copy.saveErrorStatus
          : null

  return (
    <section className="mail-editor-main">
      <nav className="mail-editor-tabs" aria-label={copy.title}>
        <button
          type="button"
          className="mail-editor-tab-back"
          title={copy.backToLibrary}
          aria-label={copy.backToLibrary}
          onClick={workspace.closeLetter}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {(['body', 'attachments', 'delivery', 'settings'] as MailEditorTab[]).map((tab) => {
          const status = tabStatuses[tab]
          const StatusIcon = status === 'complete' ? CheckCircle2 : status === 'attention' ? AlertCircle : CircleDashed
          return (
            <button
              key={tab}
              type="button"
              className={cx('mail-editor-tab', activeTab === tab && 'is-active', `is-${status}`)}
              onClick={() => setActiveTab(tab)}
            >
              <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{copy.editorTabs[tab]}</span>
              <span className="sr-only">{copy.tabStatuses[status]}</span>
            </button>
          )
        })}
        <span className="mail-editor-tabs-spacer" />
        <ExpertModeButton />
      </nav>

      <div className="mail-editor-workbar">
        <div className="mail-editor-workbar-title">
          <strong>{draft.title || workspace.activeMailId}</strong>
          <span>{workspace.activeMailId}</span>
        </div>
        <div className="mail-editor-workbar-actions">
          {workspace.isDirty ? <span className="mail-editor-dirty-badge">{copy.dirtyBadge}</span> : null}
          {saveStatusText ? (
            <span className="mail-editor-save-status" data-state={workspace.saveState}>
              {saveStatusText}
            </span>
          ) : null}
          <DraftUndoButtons onUndo={workspace.undo} onRedo={workspace.redo} />
          <button type="button" className="control-button" onClick={workspace.revert} disabled={!workspace.isDirty}>
            {copy.revertAction}
          </button>
          <button
            type="button"
            className="control-button control-button-primary"
            onClick={workspace.save}
            disabled={!workspace.isDirty || workspace.saveState === 'saving'}
          >
            {copy.saveAction}
          </button>
        </div>
      </div>

      <div className="mail-editor-tab-content custom-scrollbar">
        {activeTab === 'body' ? (
          <div className="mail-editor-tab-pane">
            <div className="mail-editor-section">
              <span className="mail-editor-field-label">{copy.editor.bodyLabel}</span>
              <div className="mail-editor-toolbar" role="toolbar" aria-label={copy.editor.bodyLabel}>
                {bodyActions.map((button) => (
                  <button key={button.key} type="button" className="mail-editor-toolbar-button" onClick={button.onClick}>
                    <button.icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{button.label}</span>
                  </button>
                ))}
                <MailLocalizedTextPicker
                  gameRootPath={workspace.gameRootPath}
                  locale={workspace.locale}
                  category="dialogue"
                  onInsert={insertIntoBody}
                />
              </div>
              <textarea
                ref={textareaRef}
                className="mail-editor-textarea custom-scrollbar"
                value={draft.body}
                onChange={(event) => workspace.updateActiveDraft({ ...draft, body: event.target.value })}
                placeholder={copy.editor.bodyPlaceholder}
                spellCheck={false}
              />
            </div>
          </div>
        ) : null}

        {activeTab === 'attachments' ? (
          <div className="mail-editor-tab-pane">
            <div className="mail-editor-toolbar" role="toolbar" aria-label={copy.editor.attachmentsLabel}>
              {attachmentActions.map((button) => (
                <button key={button.key} type="button" className="mail-editor-toolbar-button" onClick={button.onClick}>
                  <button.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{button.label}</span>
                </button>
              ))}
            </div>
            <AttachmentChips />
          </div>
        ) : null}

        {activeTab === 'delivery' ? (
          <div className="mail-editor-tab-pane">
            <MailDeliverySection />
          </div>
        ) : null}

        {activeTab === 'settings' ? (
          <div className="mail-editor-tab-pane">
            <MailInfoSidebar />
          </div>
        ) : null}
      </div>

      <MailAttachmentDialog
        open={attachmentDialog.open}
        initialKind={attachmentDialog.kind}
        onClose={() => setAttachmentDialog((current) => ({ ...current, open: false }))}
        onInsert={appendAttachment}
      />
      <MailGenderSplitDialog open={genderDialogOpen} onClose={() => setGenderDialogOpen(false)} onInsert={insertIntoBody} />
    </section>
  )
}
