import { AlertTriangle } from 'lucide-react'
import { useId } from 'react'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

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
  const titleId = useId()

  return (
    <Dialog open={open} onClose={onClose} size="sm" labelledBy={titleId}>
      <DialogHeader
        title={title}
        tone="warning"
        icon={<AlertTriangle className="h-4 w-4" />}
        onClose={onClose}
        closeLabel={cancelLabel}
        id={titleId}
      />
      <DialogBody>
        <p className="text-text-secondary text-xs">{message}</p>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{cancelLabel}</DialogAction>
        <DialogAction
          tone="danger"
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
