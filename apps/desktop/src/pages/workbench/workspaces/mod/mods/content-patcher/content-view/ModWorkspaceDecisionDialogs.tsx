import { useId } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useModCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

type PendingUnsavedChangeDecision = {
  saving: boolean
  error: string | null
}

type ModWorkspaceDecisionDialogsProps = {
  pendingUnsavedChangeDecision: PendingUnsavedChangeDecision | null
  onConfirmUnsavedSaveAndContinue: () => void
  onConfirmUnsavedDiscardAndContinue: () => void
  onCancelUnsavedChangeDecision: () => void
}

export function ModWorkspaceDecisionDialogs({
  pendingUnsavedChangeDecision,
  onConfirmUnsavedSaveAndContinue,
  onConfirmUnsavedDiscardAndContinue,
  onCancelUnsavedChangeDecision,
}: ModWorkspaceDecisionDialogsProps) {
  const copy = useModCopy()

  return (
    <WorkspaceDecisionDialog
      open={Boolean(pendingUnsavedChangeDecision)}
      title={copy.unsavedChangesTitle}
      message={copy.unsavedChangesMessage}
      error={pendingUnsavedChangeDecision?.error ?? null}
      saving={pendingUnsavedChangeDecision?.saving ?? false}
      cancelLabel={copy.unsavedCancel}
      secondaryLabel={copy.unsavedDiscardAndContinue}
      primaryLabel={copy.unsavedSaveAndContinue}
      onCancel={onCancelUnsavedChangeDecision}
      onSecondary={onConfirmUnsavedDiscardAndContinue}
      onPrimary={onConfirmUnsavedSaveAndContinue}
    />
  )
}

type WorkspaceDecisionDialogProps = {
  open: boolean
  title: string
  message: string
  error: string | null
  saving: boolean
  cancelLabel: string
  primaryLabel: string
  secondaryLabel?: string
  cancelDisabled?: boolean
  onCancel: () => void
  onPrimary: () => void
  onSecondary?: () => void
}

export function WorkspaceDecisionDialog({
  open,
  title,
  message,
  error,
  saving,
  cancelLabel,
  primaryLabel,
  secondaryLabel,
  cancelDisabled = false,
  onCancel,
  onPrimary,
  onSecondary,
}: WorkspaceDecisionDialogProps) {
  const titleId = useId()
  const cancelBlocked = cancelDisabled || saving

  return (
    <Dialog open={open} onClose={onCancel} size="sm" labelledBy={titleId} closeOnBackdrop={!cancelBlocked} closeOnEscape={!cancelBlocked}>
      <DialogHeader
        title={title}
        tone="warning"
        icon={<AlertTriangle className="h-4 w-4" />}
        onClose={onCancel}
        closeLabel={cancelLabel}
        closeDisabled={cancelBlocked}
        id={titleId}
      />
      <DialogBody>
        <p className="text-text-secondary text-sm">{message}</p>
        {error ? <p className="app-dialog-error mt-3">{error}</p> : null}
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onCancel} disabled={cancelBlocked}>
          {cancelLabel}
        </DialogAction>
        {secondaryLabel ? (
          <DialogAction tone="warning" disabled={saving} onClick={onSecondary}>
            {secondaryLabel}
          </DialogAction>
        ) : null}
        <DialogAction tone="primary" disabled={saving} onClick={onPrimary}>
          {primaryLabel}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
