import { useState, type FormEvent } from 'react'
import { useId } from 'react'
import { useEditorCopy } from '@locales/provider'
import type { CpMakerDraft } from '@features/cp-maker'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { formValueToMetadata, metadataToFormValue } from '../model/manifestFormState'
import { ManifestMetadataForm } from './ManifestMetadataForm'

type ProjectPropertiesDialogProps = {
  open: boolean
  metadata: CpMakerDraft['projectMetadata']
  onClose: () => void
  onSave: (metadata: Partial<CpMakerDraft['projectMetadata']>) => void | Promise<void>
}

export function ProjectPropertiesDialog({ open, metadata, onClose, onSave }: ProjectPropertiesDialogProps) {
  return <ProjectPropertiesDialogForm key={JSON.stringify(metadata)} open={open} metadata={metadata} onClose={onClose} onSave={onSave} />
}

function ProjectPropertiesDialogForm({ open, metadata, onClose, onSave }: ProjectPropertiesDialogProps) {
  const copy = useEditorCopy().studioDesk
  const titleId = useId()
  const [form, setForm] = useState(() => metadataToFormValue(metadata))

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form.projectName.trim() || !form.projectUniqueId.trim()) return
    void onSave(formValueToMetadata(form))
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg" labelledBy={titleId}>
      <DialogHeader title={copy.editProjectProperties} onClose={onClose} closeLabel={copy.createDialog.cancel} id={titleId} />
      <DialogBody>
        <form id="project-properties-form" onSubmit={handleSubmit}>
          <ManifestMetadataForm value={form} onChange={setForm} autoFocusName />
        </form>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.createDialog.cancel}</DialogAction>
        <DialogAction
          type="submit"
          tone="primary"
          form="project-properties-form"
          disabled={!form.projectName.trim() || !form.projectUniqueId.trim()}
        >
          {copy.toolbar.save}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
