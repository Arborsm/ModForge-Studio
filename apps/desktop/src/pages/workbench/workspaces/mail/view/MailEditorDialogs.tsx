import { useId, useState } from 'react'
import { Gift, Users } from 'lucide-react'
import { useMailEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import {
  DEPRECATED_ATTACHMENT_KINDS,
  MAIL_TOOL_TYPES,
  type MailAttachment,
  type MailAttachmentKind,
  type MailItemPair,
} from '../entities/mail'

/** Attachment kinds offered by the builder; `unknown` is parse-only and not buildable. */
const BUILDABLE_KINDS: readonly MailAttachmentKind[] = [
  'id',
  'money',
  'quest',
  'cookingRecipe',
  'craftingRecipe',
  'conversationTopic',
  'specialOrder',
  'itemRecovery',
  'object',
  'bigobject',
  'furniture',
  'tools',
]

type AttachmentFormState = {
  kind: MailAttachmentKind
  items: MailItemPair[]
  ids: string
  tools: string[]
  moneyMin: string
  moneyMax: string
  questId: string
  questAuto: boolean
  recipeKey: string
  topicId: string
  topicDays: string
  orderId: string
  orderImmediate: boolean
}

function initialFormState(kind: MailAttachmentKind): AttachmentFormState {
  return {
    kind,
    items: [{ itemId: '', count: 1 }],
    ids: '',
    tools: [],
    moneyMin: '',
    moneyMax: '',
    questId: '',
    questAuto: false,
    recipeKey: '',
    topicId: '',
    topicDays: '4',
    orderId: '',
    orderImmediate: false,
  }
}

function parseOptionalInteger(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed || !/^-?\d+$/u.test(trimmed)) {
    return null
  }
  return Number.parseInt(trimmed, 10)
}

function buildAttachment(form: AttachmentFormState): MailAttachment | null {
  switch (form.kind) {
    case 'id':
    case 'object': {
      const items = form.items.map((item) => ({ itemId: item.itemId.trim(), count: item.count })).filter((item) => item.itemId.length > 0)
      return items.length > 0 ? { kind: form.kind, items } : null
    }
    case 'bigobject':
    case 'furniture': {
      const ids = form.ids.split(/\s+/u).filter(Boolean)
      return ids.length > 0 ? { kind: form.kind, ids } : null
    }
    case 'tools':
      return form.tools.length > 0 ? { kind: 'tools', tools: form.tools } : null
    case 'money': {
      const min = parseOptionalInteger(form.moneyMin)
      if (min === null) {
        return null
      }
      return { kind: 'money', min, max: parseOptionalInteger(form.moneyMax) }
    }
    case 'quest':
      return form.questId.trim() ? { kind: 'quest', questId: form.questId.trim(), autoAdd: form.questAuto } : null
    case 'cookingRecipe':
      return { kind: 'cookingRecipe', recipeKey: form.recipeKey.trim() || null }
    case 'craftingRecipe':
      return form.recipeKey.trim() ? { kind: 'craftingRecipe', recipeKey: form.recipeKey.trim() } : null
    case 'conversationTopic': {
      const days = parseOptionalInteger(form.topicDays)
      return form.topicId.trim() && days !== null && days >= 0 ? { kind: 'conversationTopic', topicId: form.topicId.trim(), days } : null
    }
    case 'specialOrder':
      return form.orderId.trim() ? { kind: 'specialOrder', orderId: form.orderId.trim(), immediately: form.orderImmediate } : null
    case 'itemRecovery':
      return { kind: 'itemRecovery' }
    default:
      return null
  }
}

function ItemPairFields({ form, onChange }: { form: AttachmentFormState; onChange: (next: AttachmentFormState) => void }) {
  const copy = useMailEditorCopy().attachments
  return (
    <div className="mail-editor-dialog-field">
      <span className="mail-editor-dialog-label">{copy.itemsLabel}</span>
      {form.items.map((item, index) => (
        <div key={index} className="mail-editor-dialog-item-row">
          <input
            className="control-input"
            value={item.itemId}
            onChange={(event) =>
              onChange({
                ...form,
                items: form.items.map((row, rowIndex) => (rowIndex === index ? { ...row, itemId: event.target.value } : row)),
              })
            }
            placeholder={copy.itemIdPlaceholder}
            aria-label={copy.itemIdLabel}
            spellCheck={false}
          />
          <input
            className="control-input mail-editor-dialog-count"
            type="number"
            min={1}
            value={item.count ?? ''}
            onChange={(event) =>
              onChange({
                ...form,
                items: form.items.map((row, rowIndex) =>
                  rowIndex === index ? { ...row, count: parseOptionalInteger(event.target.value) } : row,
                ),
              })
            }
            aria-label={copy.countLabel}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={copy.removeItemRowLabel}
            disabled={form.items.length === 1}
            onClick={() => onChange({ ...form, items: form.items.filter((_, rowIndex) => rowIndex !== index) })}
          >
            ×
          </button>
        </div>
      ))}
      <div className="mail-editor-dialog-item-actions">
        <button
          type="button"
          className="control-button"
          onClick={() => onChange({ ...form, items: [...form.items, { itemId: '', count: 1 }] })}
        >
          {copy.addItemRowAction}
        </button>
        <span className="mail-editor-dialog-hint">{copy.randomPickHint}</span>
      </div>
    </div>
  )
}

function AttachmentKindFields({ form, onChange }: { form: AttachmentFormState; onChange: (next: AttachmentFormState) => void }) {
  const copy = useMailEditorCopy().attachments
  switch (form.kind) {
    case 'id':
    case 'object':
      return <ItemPairFields form={form} onChange={onChange} />
    case 'bigobject':
    case 'furniture':
      return (
        <label className="mail-editor-dialog-field">
          <span className="mail-editor-dialog-label">{copy.itemIdLabel}</span>
          <input
            className="control-input"
            value={form.ids}
            onChange={(event) => onChange({ ...form, ids: event.target.value })}
            placeholder={copy.itemIdPlaceholder}
            spellCheck={false}
          />
          <span className="mail-editor-dialog-hint">{copy.randomPickHint}</span>
        </label>
      )
    case 'tools':
      return (
        <div className="mail-editor-dialog-field">
          <span className="mail-editor-dialog-label">{copy.toolsLabel}</span>
          <div className="mail-editor-dialog-tools">
            {MAIL_TOOL_TYPES.map((tool) => (
              <label key={tool} className="mail-editor-dialog-check">
                <input
                  type="checkbox"
                  checked={form.tools.includes(tool)}
                  onChange={(event) =>
                    onChange({
                      ...form,
                      tools: event.target.checked ? [...form.tools, tool] : form.tools.filter((value) => value !== tool),
                    })
                  }
                />
                <span>{copy.toolNames[tool]}</span>
              </label>
            ))}
          </div>
        </div>
      )
    case 'money':
      return (
        <div className="mail-editor-dialog-grid">
          <label className="mail-editor-dialog-field">
            <span className="mail-editor-dialog-label">{copy.moneyMinLabel}</span>
            <input
              className="control-input"
              type="number"
              min={0}
              value={form.moneyMin}
              onChange={(event) => onChange({ ...form, moneyMin: event.target.value })}
            />
          </label>
          <label className="mail-editor-dialog-field">
            <span className="mail-editor-dialog-label">{copy.moneyMaxLabel}</span>
            <input
              className="control-input"
              type="number"
              min={0}
              value={form.moneyMax}
              onChange={(event) => onChange({ ...form, moneyMax: event.target.value })}
            />
            <span className="mail-editor-dialog-hint">{copy.moneyMaxHint}</span>
          </label>
        </div>
      )
    case 'quest':
      return (
        <div className="mail-editor-dialog-field">
          <label className="mail-editor-dialog-field">
            <span className="mail-editor-dialog-label">{copy.questIdLabel}</span>
            <input
              className="control-input"
              value={form.questId}
              onChange={(event) => onChange({ ...form, questId: event.target.value })}
              spellCheck={false}
            />
          </label>
          <label className="mail-editor-dialog-check">
            <input type="checkbox" checked={form.questAuto} onChange={(event) => onChange({ ...form, questAuto: event.target.checked })} />
            <span>{copy.questAutoLabel}</span>
          </label>
        </div>
      )
    case 'cookingRecipe':
    case 'craftingRecipe':
      return (
        <label className="mail-editor-dialog-field">
          <span className="mail-editor-dialog-label">{copy.recipeKeyLabel}</span>
          <input
            className="control-input"
            value={form.recipeKey}
            onChange={(event) => onChange({ ...form, recipeKey: event.target.value })}
            spellCheck={false}
          />
          {form.kind === 'cookingRecipe' ? <span className="mail-editor-dialog-hint">{copy.cookingRecipeKeyHint}</span> : null}
        </label>
      )
    case 'conversationTopic':
      return (
        <div className="mail-editor-dialog-grid">
          <label className="mail-editor-dialog-field">
            <span className="mail-editor-dialog-label">{copy.topicIdLabel}</span>
            <input
              className="control-input"
              value={form.topicId}
              onChange={(event) => onChange({ ...form, topicId: event.target.value })}
              spellCheck={false}
            />
          </label>
          <label className="mail-editor-dialog-field">
            <span className="mail-editor-dialog-label">{copy.topicDaysLabel}</span>
            <input
              className="control-input"
              type="number"
              min={0}
              value={form.topicDays}
              onChange={(event) => onChange({ ...form, topicDays: event.target.value })}
            />
          </label>
        </div>
      )
    case 'specialOrder':
      return (
        <div className="mail-editor-dialog-field">
          <label className="mail-editor-dialog-field">
            <span className="mail-editor-dialog-label">{copy.orderIdLabel}</span>
            <input
              className="control-input"
              value={form.orderId}
              onChange={(event) => onChange({ ...form, orderId: event.target.value })}
              spellCheck={false}
            />
          </label>
          <label className="mail-editor-dialog-check">
            <input
              type="checkbox"
              checked={form.orderImmediate}
              onChange={(event) => onChange({ ...form, orderImmediate: event.target.checked })}
            />
            <span>{copy.orderImmediateLabel}</span>
          </label>
        </div>
      )
    default:
      return null
  }
}

type MailAttachmentDialogProps = {
  open: boolean
  initialKind: MailAttachmentKind
  onClose: () => void
  onInsert: (attachment: MailAttachment) => void
}

/** Builds a `%item …%%` attachment from typed fields and inserts it into the active letter. */
export function MailAttachmentDialog({ open, initialKind, onClose, onInsert }: MailAttachmentDialogProps) {
  const copy = useMailEditorCopy().attachments
  const titleId = useId()
  const [form, setForm] = useState<AttachmentFormState>(() => initialFormState(initialKind))
  const [lastOpenKind, setLastOpenKind] = useState<{ open: boolean; kind: MailAttachmentKind }>({ open, kind: initialKind })
  if (open !== lastOpenKind.open || initialKind !== lastOpenKind.kind) {
    setLastOpenKind({ open, kind: initialKind })
    if (open) {
      setForm(initialFormState(initialKind))
    }
  }
  const attachment = buildAttachment(form)

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="md">
      <DialogHeader
        id={titleId}
        title={copy.dialogTitle}
        subtitle={copy.dialogSubtitle}
        icon={<Gift className="h-4 w-4" aria-hidden="true" />}
        onClose={onClose}
        closeLabel={copy.closeLabel}
      />
      <DialogBody>
        <label className="mail-editor-dialog-field">
          <span className="mail-editor-dialog-label">{copy.kindLabel}</span>
          <select
            className="control-input"
            value={form.kind}
            onChange={(event) => setForm(initialFormState(event.target.value as MailAttachmentKind))}
          >
            {BUILDABLE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {copy.kinds[kind as keyof typeof copy.kinds]}
                {DEPRECATED_ATTACHMENT_KINDS.includes(kind) ? ` · ${copy.deprecatedBadge}` : ''}
              </option>
            ))}
          </select>
        </label>
        <AttachmentKindFields form={form} onChange={setForm} />
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.cancelAction}</DialogAction>
        <DialogAction
          tone="primary"
          disabled={attachment === null}
          onClick={() => {
            if (attachment) {
              onInsert(attachment)
              onClose()
            }
          }}
        >
          {copy.insertAction}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}

type MailGenderSplitDialogProps = {
  open: boolean
  onClose: () => void
  onInsert: (snippet: string) => void
}

/** Two-field dialog inserting a `male¦female` gender branch into the letter body. */
export function MailGenderSplitDialog({ open, onClose, onInsert }: MailGenderSplitDialogProps) {
  const copy = useMailEditorCopy().gender
  const titleId = useId()
  const [male, setMale] = useState('')
  const [female, setFemale] = useState('')
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setMale('')
      setFemale('')
    }
  }
  const canInsert = male.trim().length > 0 || female.trim().length > 0

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="sm">
      <DialogHeader
        id={titleId}
        title={copy.dialogTitle}
        subtitle={copy.dialogSubtitle}
        icon={<Users className="h-4 w-4" aria-hidden="true" />}
        onClose={onClose}
        closeLabel={copy.closeLabel}
      />
      <DialogBody>
        <label className="mail-editor-dialog-field">
          <span className="mail-editor-dialog-label">{copy.maleLabel}</span>
          <input
            className="control-input"
            value={male}
            onChange={(event) => setMale(event.target.value)}
            placeholder={copy.malePlaceholder}
          />
        </label>
        <label className="mail-editor-dialog-field">
          <span className="mail-editor-dialog-label">{copy.femaleLabel}</span>
          <input
            className="control-input"
            value={female}
            onChange={(event) => setFemale(event.target.value)}
            placeholder={copy.femalePlaceholder}
          />
        </label>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.cancelAction}</DialogAction>
        <DialogAction
          tone="primary"
          disabled={!canInsert}
          onClick={() => {
            onInsert(`${male}¦${female}`)
            onClose()
          }}
        >
          {copy.insertAction}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
