/**
 * @file Reusable confirmation dialog for destructive delete actions.
 * @module features/cp-maker
 */
import { AlertTriangle } from 'lucide-react'
import { useId } from 'react'
import { useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

interface DeleteConfirmDialogProps {
  open: boolean
  title: string
  message: string
  onClose: () => void
  onConfirm: () => void
}

/** Confirmation dialog for delete operations with a warning tone. */
export function DeleteConfirmDialog({ open, title, message, onClose, onConfirm }: DeleteConfirmDialogProps) {
  const titleId = useId()
  const cancelLabel = useEditorCopy().studioDesk.createDialog.cancel
  const confirmLabel = useEditorCopy().studioDesk.deleteProject

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
