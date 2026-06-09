import { useModWorkspaceCopy } from '@locales/localeContext'
import { AlertTriangle, X } from 'lucide-react'

type PendingUnsavedChangeDecision = {
  saving: boolean
  error: string | null
}

type PendingExportOverwriteDecision = {
  targetPath: string
  saving: boolean
  error: string | null
}

type ModWorkspaceDecisionDialogsProps = {
  pendingUnsavedChangeDecision: PendingUnsavedChangeDecision | null
  pendingExportOverwriteDecision: PendingExportOverwriteDecision | null
  onConfirmUnsavedSaveAndContinue: () => void
  onConfirmUnsavedDiscardAndContinue: () => void
  onCancelUnsavedChangeDecision: () => void
  onConfirmExportOverwrite: () => void
  onCancelExportOverwrite: () => void
}

export function ModWorkspaceDecisionDialogs({
  pendingUnsavedChangeDecision,
  pendingExportOverwriteDecision,
  onConfirmUnsavedSaveAndContinue,
  onConfirmUnsavedDiscardAndContinue,
  onCancelUnsavedChangeDecision,
  onConfirmExportOverwrite,
  onCancelExportOverwrite,
}: ModWorkspaceDecisionDialogsProps) {
  const copy = useModWorkspaceCopy()

  return (
    <>
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
      <WorkspaceDecisionDialog
        open={Boolean(pendingExportOverwriteDecision)}
        title={copy.exportOverwriteTitle}
        message={copy.exportOverwriteMessage(pendingExportOverwriteDecision?.targetPath ?? '')}
        error={pendingExportOverwriteDecision?.error ?? null}
        saving={pendingExportOverwriteDecision?.saving ?? false}
        cancelLabel={copy.unsavedCancel}
        primaryLabel={copy.exportOverwriteConfirm}
        onCancel={onCancelExportOverwrite}
        onPrimary={onConfirmExportOverwrite}
      />
    </>
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
  onCancel,
  onPrimary,
  onSecondary,
}: WorkspaceDecisionDialogProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45">
      <div className="w-[420px] max-w-[92vw] rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          </div>
          <button type="button" className="icon-button h-7 w-7" disabled={saving} onClick={onCancel}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm text-[var(--text-secondary)]">{message}</p>
          {error ? <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p> : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className="control-button text-xs" disabled={saving} onClick={onCancel}>
              {cancelLabel}
            </button>
            {secondaryLabel ? (
              <button
                type="button"
                className="control-button text-xs text-amber-300 hover:bg-amber-500/10"
                disabled={saving}
                onClick={onSecondary}
              >
                {secondaryLabel}
              </button>
            ) : null}
            <button type="button" className="control-button text-xs text-[var(--accent-color)]" disabled={saving} onClick={onPrimary}>
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
