import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { EditorCopy } from '@locales'
import type { CpMakerDraft } from '@shared/contracts'

type ProjectPropertiesMetadata = Pick<
  CpMakerDraft['projectMetadata'],
  'projectName' | 'projectDescription' | 'projectAuthor' | 'projectVersion' | 'projectUniqueId'
>

type ProjectPropertiesDialogProps = {
  open: boolean
  copy: EditorCopy['studioDesk']
  metadata: ProjectPropertiesMetadata
  onClose: () => void
  onSave: (metadata: ProjectPropertiesMetadata) => void | Promise<void>
}

export function ProjectPropertiesDialog({ open, copy, metadata, onClose, onSave }: ProjectPropertiesDialogProps) {
  if (!open) return null

  const metadataKey = [
    metadata.projectName,
    metadata.projectDescription,
    metadata.projectAuthor,
    metadata.projectVersion,
    metadata.projectUniqueId,
  ].join('\0')

  return <ProjectPropertiesDialogForm key={metadataKey} copy={copy} metadata={metadata} onClose={onClose} onSave={onSave} />
}

function ProjectPropertiesDialogForm({ copy, metadata, onClose, onSave }: Omit<ProjectPropertiesDialogProps, 'open'>) {
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div
        className="w-[520px] max-w-[90vw] rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={copy.editProjectProperties}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{copy.editProjectProperties}</span>
          <button type="button" className="icon-button h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 px-4 py-4">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">{copy.createDialog.projectName}</span>
            <input
              type="text"
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              value={form.projectName}
              onChange={(event) => setForm((current) => ({ ...current, projectName: event.target.value }))}
              autoFocus
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">{copy.createDialog.uniqueId}</span>
            <input
              type="text"
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              value={form.projectUniqueId}
              onChange={(event) => setForm((current) => ({ ...current, projectUniqueId: event.target.value }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--text-secondary)]">{copy.createDialog.author}</span>
              <input
                type="text"
                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={form.projectAuthor}
                onChange={(event) => setForm((current) => ({ ...current, projectAuthor: event.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--text-secondary)]">{copy.createDialog.version}</span>
              <input
                type="text"
                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={form.projectVersion}
                onChange={(event) => setForm((current) => ({ ...current, projectVersion: event.target.value }))}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">{copy.createDialog.description}</span>
            <textarea
              className="min-h-20 w-full resize-none rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              value={form.projectDescription}
              onChange={(event) => setForm((current) => ({ ...current, projectDescription: event.target.value }))}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="control-button text-xs" onClick={onClose}>
              {copy.createDialog.cancel}
            </button>
            <button
              type="submit"
              className="control-button control-button-primary text-xs"
              disabled={!form.projectName.trim() || !form.projectUniqueId.trim()}
            >
              {copy.toolbar.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
