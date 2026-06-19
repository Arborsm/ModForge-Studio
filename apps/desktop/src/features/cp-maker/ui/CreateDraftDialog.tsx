import { useState, type FormEvent } from 'react'
import { useId } from 'react'
import type { EditorCopy } from '@locales'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

interface CreateDraftDialogProps {
  open: boolean
  copy: EditorCopy['studioDesk']['createDialog']
  onClose: () => void
  onCreate: (metadata: {
    projectName: string
    projectDescription: string
    projectAuthor: string
    projectVersion: string
    projectUniqueId: string
  }) => void
}

export function CreateDraftDialog({ open, copy, onClose, onCreate }: CreateDraftDialogProps) {
  const titleId = useId()
  const [form, setForm] = useState({
    projectName: '',
    projectDescription: '',
    projectAuthor: '',
    projectVersion: '1.0.0',
    projectUniqueId: '',
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.projectName.trim() || !form.projectUniqueId.trim()) return
    onCreate({
      projectName: form.projectName.trim(),
      projectDescription: form.projectDescription.trim(),
      projectAuthor: form.projectAuthor.trim(),
      projectVersion: form.projectVersion.trim(),
      projectUniqueId: form.projectUniqueId.trim(),
    })
    setForm({
      projectName: '',
      projectDescription: '',
      projectAuthor: '',
      projectVersion: '1.0.0',
      projectUniqueId: '',
    })
  }

  return (
    <Dialog open={open} onClose={onClose} size="md" labelledBy={titleId}>
      <DialogHeader title={copy.title} onClose={onClose} closeLabel={copy.cancel} id={titleId} />
      <DialogBody>
        <form id="create-draft-form" onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">{copy.projectName}</span>
            <input
              type="text"
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              value={form.projectName}
              onChange={(e) => {
                const name = e.target.value
                setForm((f) => ({
                  ...f,
                  projectName: name,
                  projectUniqueId: f.projectUniqueId || `YourName.${name.replace(/\s+/g, '')}`,
                }))
              }}
              autoFocus
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">{copy.uniqueId}</span>
            <input
              type="text"
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              value={form.projectUniqueId}
              onChange={(e) => setForm((f) => ({ ...f, projectUniqueId: e.target.value }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--text-secondary)]">{copy.author}</span>
              <input
                type="text"
                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={form.projectAuthor}
                onChange={(e) => setForm((f) => ({ ...f, projectAuthor: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--text-secondary)]">{copy.version}</span>
              <input
                type="text"
                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={form.projectVersion}
                onChange={(e) => setForm((f) => ({ ...f, projectVersion: e.target.value }))}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">{copy.description}</span>
            <input
              type="text"
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              value={form.projectDescription}
              onChange={(e) => setForm((f) => ({ ...f, projectDescription: e.target.value }))}
            />
          </label>
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
