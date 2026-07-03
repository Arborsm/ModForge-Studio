import { useCallback, useState } from 'react'

/** Result of {@link useDialog}. */
export type DialogResult = {
  /** Whether the dialog is currently open. */
  open: boolean
  /** Opens the dialog. */
  openDialog: () => void
  /** Closes the dialog. */
  closeDialog: () => void
  /** Toggles the dialog open state. */
  toggleDialog: () => void
  /** Props to spread onto a {@link Dialog} instance. */
  dialogProps: { open: boolean; onClose: () => void }
}

/**
 * Standardizes dialog open/close state at a call site.
 *
 * Replaces the recurring `const [xOpen, setXOpen] = useState(false)` plus a
 * hand-written `onClose` closure. Spread `dialogProps` onto a `Dialog`.
 */
export function useDialog(initialOpen = false): DialogResult {
  const [open, setOpen] = useState(initialOpen)
  const closeDialog = useCallback(() => setOpen(false), [])
  const openDialog = useCallback(() => setOpen(true), [])
  const toggleDialog = useCallback(() => setOpen((current) => !current), [])

  return {
    open,
    openDialog,
    closeDialog,
    toggleDialog,
    dialogProps: { open, onClose: closeDialog },
  }
}
