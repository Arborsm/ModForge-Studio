import { useState } from 'react'
import { X } from 'lucide-react'

interface CreateDraftDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (metadata: {
    projectName: string
    projectDescription: string
    projectAuthor: string
    projectVersion: string
    projectUniqueId: string
  }) => void
}

export function CreateDraftDialog({ open, onClose, onCreate }: CreateDraftDialogProps) {
  const [form, setForm] = useState({
    projectName: '',
    projectDescription: '',
    projectAuthor: '',
    projectVersion: '1.0.0',
    projectUniqueId: '',
  })

  if (!open) return null

  function handleSubmit(e: React.FormEvent) {
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="w-[480px] max-w-[90vw] rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Create New Project</span>
          <button type="button" className="icon-button h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 px-4 py-4">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">Project Name *</span>
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
              placeholder="My Awesome Mod"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">UniqueID *</span>
            <input
              type="text"
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              value={form.projectUniqueId}
              onChange={(e) => setForm((f) => ({ ...f, projectUniqueId: e.target.value }))}
              placeholder="Author.ModName"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--text-secondary)]">Author</span>
              <input
                type="text"
                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={form.projectAuthor}
                onChange={(e) => setForm((f) => ({ ...f, projectAuthor: e.target.value }))}
                placeholder="Your Name"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--text-secondary)]">Version</span>
              <input
                type="text"
                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={form.projectVersion}
                onChange={(e) => setForm((f) => ({ ...f, projectVersion: e.target.value }))}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">Description</span>
            <input
              type="text"
              className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              value={form.projectDescription}
              onChange={(e) => setForm((f) => ({ ...f, projectDescription: e.target.value }))}
              placeholder="Short description of your mod"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="control-button text-xs" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="control-button control-button-primary text-xs"
              disabled={!form.projectName.trim() || !form.projectUniqueId.trim()}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
