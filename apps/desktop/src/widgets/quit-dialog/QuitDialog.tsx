import { LogOut, Minimize2 } from 'lucide-react'
import { useId } from 'react'
import { useSettingsMenuCopy } from '@locales/provider'
import { Dialog, DialogHeader, DialogBody, DialogFooter, DialogAction } from '@shared/ui/Dialog'

export type QuitDialogProps = {
  open: boolean
  onClose: () => void
  onQuit: () => void
  onMinimizeToTray: () => void
  rememberChoice: boolean
  onRememberChoiceChange: (remember: boolean) => void
}

export function QuitDialog({ open, onClose, onQuit, onMinimizeToTray, rememberChoice, onRememberChoiceChange }: QuitDialogProps) {
  const copy = useSettingsMenuCopy()
  const titleId = useId()
  const descriptionId = useId()

  return (
    <Dialog open={open} onClose={onClose} size="sm" labelledBy={titleId} describedBy={descriptionId} closeOnBackdrop={false}>
      <DialogHeader
        id={titleId}
        title={copy.quitDialogTitle}
        subtitle={copy.quitDialogMessage}
        icon={<LogOut className="h-5 w-5" />}
        onClose={onClose}
        closeLabel={copy.closeDialogLabel}
      />
      <DialogBody>
        <div className="flex flex-col gap-4">
          <p id={descriptionId} className="text-sm text-[var(--text-secondary)]">
            {copy.quitDialogDescription}
          </p>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={rememberChoice}
              onChange={(event) => onRememberChoiceChange(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-subtle)] accent-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text-secondary)]">{copy.rememberCloseChoiceLabel}</span>
          </label>
        </div>
      </DialogBody>
      <DialogFooter align="between">
        <DialogAction onClick={onMinimizeToTray}>
          <Minimize2 className="mr-1.5 h-4 w-4" />
          {copy.minimizeToTrayActionLabel}
        </DialogAction>
        <div className="flex gap-2">
          <DialogAction onClick={onClose}>{copy.cancelActionLabel}</DialogAction>
          <DialogAction tone="danger" onClick={onQuit}>
            <LogOut className="mr-1.5 h-4 w-4" />
            {copy.quitActionLabel}
          </DialogAction>
        </div>
      </DialogFooter>
    </Dialog>
  )
}
