import { useState, type FormEvent } from 'react'
import { useId } from 'react'
import { useEditorCopy } from '@locales/provider'
import type { CpMakerDraft } from '@features/cp-maker'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

type ProjectPropertiesMetadata = Pick<
  CpMakerDraft['projectMetadata'],
  'projectName' | 'projectDescription' | 'projectAuthor' | 'projectVersion' | 'projectUniqueId'
>

type ProjectPropertiesDialogProps = {
  open: boolean
  metadata: ProjectPropertiesMetadata
  onClose: () => void
  onSave: (metadata: ProjectPropertiesMetadata) => void | Promise<void>
}

export function ProjectPropertiesDialog({ open, metadata, onClose, onSave }: ProjectPropertiesDialogProps) {
  const metadataKey = [
    metadata.projectName,
    metadata.projectDescription,
    metadata.projectAuthor,
    metadata.projectVersion,
    metadata.projectUniqueId,
  ].join('\0')

  return <ProjectPropertiesDialogForm key={metadataKey} open={open} metadata={metadata} onClose={onClose} onSave={onSave} />
}

function ProjectPropertiesDialogForm({ open, metadata, onClose, onSave }: ProjectPropertiesDialogProps) {
  const copy = useEditorCopy().studioDesk
  const titleId = useId()
  const [form, setForm] = useState(metadata)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form.projectName.trim() || !form.projectUniqueId.trim()) return
    void onSave({
      projectName: form.projectName.trim(),
      projectDescription: form.projectDescription.trim(),
      projectAuthor: form.projectAuthor.trim(),
      projectVersion: form.projectVersion.trim(),
      projectUniqueId: form.projectUniqueId.trim(),
    })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg" labelledBy={titleId}>
      <DialogHeader title={copy.editProjectProperties} onClose={onClose} closeLabel={copy.createDialog.cancel} id={titleId} />
      <DialogBody>
        <form id="project-properties-form" onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-(--text-secondary)">{copy.createDialog.projectName}</span>
            <input
              type="text"
              className="w-full rounded-md border border-(--border-color) bg-(--bg-app) px-3 py-2 text-sm text-(--text-primary) outline-none focus:border-(--accent)"
              value={form.projectName}
              onChange={(event) => setForm((current) => ({ ...current, projectName: event.target.value }))}
              autoFocus
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-(--text-secondary)">{copy.createDialog.uniqueId}</span>
            <input
              type="text"
              className="w-full rounded-md border border-(--border-color) bg-(--bg-app) px-3 py-2 text-sm text-(--text-primary) outline-none focus:border-(--accent)"
              value={form.projectUniqueId}
              onChange={(event) => setForm((current) => ({ ...current, projectUniqueId: event.target.value }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-(--text-secondary)">{copy.createDialog.author}</span>
              <input
                type="text"
                className="w-full rounded-md border border-(--border-color) bg-(--bg-app) px-3 py-2 text-sm text-(--text-primary) outline-none focus:border-(--accent)"
                value={form.projectAuthor}
                onChange={(event) => setForm((current) => ({ ...current, projectAuthor: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-(--text-secondary)">{copy.createDialog.version}</span>
              <input
                type="text"
                className="w-full rounded-md border border-(--border-color) bg-(--bg-app) px-3 py-2 text-sm text-(--text-primary) outline-none focus:border-(--accent)"
                value={form.projectVersion}
                onChange={(event) => setForm((current) => ({ ...current, projectVersion: event.target.value }))}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-(--text-secondary)">{copy.createDialog.description}</span>
            <textarea
              className="min-h-20 w-full resize-none rounded-md border border-(--border-color) bg-(--bg-app) px-3 py-2 text-sm text-(--text-primary) outline-none focus:border-(--accent)"
              value={form.projectDescription}
              onChange={(event) => setForm((current) => ({ ...current, projectDescription: event.target.value }))}
            />
          </label>
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
