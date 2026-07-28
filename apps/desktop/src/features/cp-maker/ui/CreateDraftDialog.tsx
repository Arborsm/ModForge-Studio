import { useState, type FormEvent } from 'react'
import { useId } from 'react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { PACK_TEMPLATES, type PackTemplateId } from '../model/packTemplates'
import type { CpMakerDraft } from '../model/types'
import { deriveUniqueId, emptyManifestFormValue, formValueToMetadata, type ManifestMetadataFormValue } from '../model/manifestFormState'
import { ManifestMetadataForm } from './ManifestMetadataForm'

export type CreateDraftInput = {
  metadata: Partial<CpMakerDraft['projectMetadata']>
  templateId: PackTemplateId
}

interface CreateDraftDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (input: CreateDraftInput) => void
}

export function CreateDraftDialog({ open, onClose, onCreate }: CreateDraftDialogProps) {
  const copy = useEditorCopy().studioDesk.createDialog
  const titleId = useId()
  const [templateId, setTemplateId] = useState<PackTemplateId>('blank')
  const [form, setForm] = useState<ManifestMetadataFormValue>(emptyManifestFormValue)

  // Auto-derive the UniqueID from author+name until the user overrides it.
  // A direct edit of the UniqueID field always wins over derivation.
  function handleFormChange(next: ManifestMetadataFormValue) {
    setForm((current) => {
      if (next.projectUniqueId !== current.projectUniqueId) {
        return next
      }
      const previousDerived = deriveUniqueId(current.projectName, current.projectAuthor)
      const autoFilled = current.projectUniqueId === '' || current.projectUniqueId === previousDerived
      return { ...next, projectUniqueId: autoFilled ? deriveUniqueId(next.projectName, next.projectAuthor) : next.projectUniqueId }
    })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.projectName.trim() || !form.projectUniqueId.trim()) return
    onCreate({ metadata: formValueToMetadata(form), templateId })
    setForm(emptyManifestFormValue())
    setTemplateId('blank')
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg" labelledBy={titleId}>
      <DialogHeader title={copy.title} onClose={onClose} closeLabel={copy.cancel} id={titleId} />
      <DialogBody>
        <form id="create-draft-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <span className="mb-2 block text-xs text-(--text-secondary)">{copy.templateLabel}</span>
            <div className="grid grid-cols-2 gap-2">
              {PACK_TEMPLATES.map((template) => {
                const templateCopy = copy.templates[template.id]
                const selected = template.id === templateId
                return (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setTemplateId(template.id)}
                    className={cx(
                      'rounded-md border px-3 py-2 text-left transition-colors',
                      selected ? 'border-(--accent) bg-(--accent-soft)' : 'border-(--border-color) hover:bg-(--bg-hover)',
                    )}
                  >
                    <span className="block text-sm font-medium text-(--text-primary)">{templateCopy.label}</span>
                    <span className="mt-0.5 block text-xs text-(--text-secondary)">{templateCopy.description}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <ManifestMetadataForm value={form} onChange={handleFormChange} autoFocusName />
        </form>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.cancel}</DialogAction>
        <DialogAction
          type="submit"
          tone="primary"
          form="create-draft-form"
          disabled={!form.projectName.trim() || !form.projectUniqueId.trim()}
        >
          {copy.create}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
