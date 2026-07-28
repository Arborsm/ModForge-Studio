import { useRef, useState } from 'react'
import { AtSign, ChefHat, CornerDownLeft, Gift, Hammer, ScrollText, Users, X } from 'lucide-react'
import { useMailEditorCopy } from '@locales/provider'
import { useMailWorkspaceContext } from '../state/MailWorkspaceContext'
import { MAIL_TEXT_COLOR_IDS, type MailAttachment, type MailAttachmentKind } from '../entities/mail'
import { MailAttachmentDialog, MailGenderSplitDialog } from './MailEditorDialogs'
import { MailDeliverySection } from './MailDeliverySection'
import { fillTemplate, formatAttachmentChip } from './mailCopyHelpers'

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

/** Center column: letter body editor with the insertion toolbar, attachments, and triggers. */
export function MailLetterEditor() {
  const copy = useMailEditorCopy()
  const workspace = useMailWorkspaceContext()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [attachmentDialog, setAttachmentDialog] = useState<{ open: boolean; kind: MailAttachmentKind }>({ open: false, kind: 'id' })
  const [genderDialogOpen, setGenderDialogOpen] = useState(false)
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

  const toolbarButtons: Array<{ key: string; label: string; icon: typeof AtSign; onClick: () => void }> = [
    { key: 'player', label: copy.editor.insertPlayerName, icon: AtSign, onClick: () => insertIntoBody('@') },
    { key: 'break', label: copy.editor.insertLineBreak, icon: CornerDownLeft, onClick: () => insertIntoBody('^') },
    { key: 'gender', label: copy.editor.insertGenderSplit, icon: Users, onClick: () => setGenderDialogOpen(true) },
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

  return (
    <section className="mail-editor-main custom-scrollbar">
      <div className="mail-editor-section">
        <span className="mail-editor-field-label">{copy.editor.bodyLabel}</span>
        <div className="mail-editor-toolbar" role="toolbar" aria-label={copy.editor.bodyLabel}>
          {toolbarButtons.map((button) => (
            <button key={button.key} type="button" className="mail-editor-toolbar-button" onClick={button.onClick}>
              <button.icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{button.label}</span>
            </button>
          ))}
          <label className="mail-editor-toolbar-color">
            <span>{copy.editor.textColorLabel}</span>
            <select
              className="control-input"
              value={draft.textColor ?? ''}
              onChange={(event) => workspace.updateActiveDraft({ ...draft, textColor: event.target.value || null })}
            >
              <option value="">{copy.info.textColorDefault}</option>
              {MAIL_TEXT_COLOR_IDS.map((colorId) => (
                <option key={colorId} value={colorId}>
                  {copy.colors[colorId]}
                </option>
              ))}
            </select>
          </label>
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
      <AttachmentChips />
      <MailDeliverySection />
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
