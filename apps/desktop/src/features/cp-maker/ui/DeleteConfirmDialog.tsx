import { X, AlertTriangle } from 'lucide-react'

interface DeleteConfirmDialogProps {
  open: boolean
  title: string
  message: string
  cancelLabel: string
  confirmLabel: string
  onClose: () => void
  onConfirm: () => void
}

export function DeleteConfirmDialog({ open, title, message, cancelLabel, confirmLabel, onClose, onConfirm }: DeleteConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="w-[360px] max-w-[90vw] rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
          </div>
          <button type="button" className="icon-button h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4">
          <p className="text-xs text-[var(--text-secondary)]">{message}</p>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="control-button text-xs" onClick={onClose}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className="control-button text-xs text-red-400 hover:bg-red-500/10"
              onClick={() => {
                onConfirm()
                onClose()
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
