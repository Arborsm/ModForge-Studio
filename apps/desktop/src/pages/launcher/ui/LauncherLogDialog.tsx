/**
 * @file Runtime log viewer dialog: shows the tail of the host log file (on Android the
 * LogCapture tee feeds game/SMAPI output into it) with manual refresh and copy.
 */

import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { readLauncherLog } from '@features/launcher/api'
import type { LauncherLogPage } from '@features/launcher/api'
import { useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { publishNotification } from '@shared/ui/notifications'

type LauncherLogDialogProps = {
  open: boolean
  onClose: () => void
}

const LOG_DIALOG_NOTIFICATION_ID = 'launcher-log-viewer'

/** Log tail viewer for the launcher configuration page. */
export function LauncherLogDialog({ open, onClose }: LauncherLogDialogProps) {
  const launcherCopy = useEditorCopy().launcher
  const copy = launcherCopy.configuration
  const [page, setPage] = useState<LauncherLogPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyResetTimerRef = useRef<number | null>(null)

  const loadLog = useCallback(async () => {
    setLoading(true)
    try {
      setPage(await readLauncherLog())
    } catch (error) {
      publishNotification({
        id: LOG_DIALOG_NOTIFICATION_ID,
        level: 'error',
        title: copy.logViewer.loadFailed,
        description: error instanceof Error ? error.message : String(error),
        autoDismissMs: null,
      })
    } finally {
      setLoading(false)
    }
  }, [copy.logViewer.loadFailed])

  useEffect(() => {
    if (open) {
      void loadLog()
    }
  }, [loadLog, open])

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current)
      }
    }
  }, [])

  const handleCopy = async () => {
    if (!page?.lines.length) {
      return
    }

    try {
      await navigator.clipboard.writeText(page.lines.join('\n'))
      setCopied(true)
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current)
      }
      copyResetTimerRef.current = window.setTimeout(() => setCopied(false), 1_500)
    } catch (error) {
      publishNotification({
        id: LOG_DIALOG_NOTIFICATION_ID,
        level: 'error',
        title: copy.logViewer.loadFailed,
        description: error instanceof Error ? error.message : String(error),
        autoDismissMs: null,
      })
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="xl" ariaLabel={copy.logViewer.title}>
      <DialogHeader
        title={copy.logViewer.title}
        subtitle={copy.logViewer.subtitle}
        closeLabel={launcherCopy.actions.closeDialog}
        onClose={onClose}
      />
      <DialogBody>
        <pre className="launcher-log-dialog-output" data-loading={loading ? 'true' : undefined}>
          {page?.lines.length ? page.lines.join('\n') : copy.logViewer.empty}
        </pre>
        {page?.truncated ? <p className="launcher-log-dialog-note">{copy.logViewer.truncatedDetail(page.lines.length)}</p> : null}
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={() => void loadLog()} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" />
          {copy.logViewer.refresh}
        </DialogAction>
        <DialogAction tone="primary" onClick={() => void handleCopy()} disabled={!page?.lines.length}>
          {copied ? copy.logViewer.copyDone : copy.logViewer.copy}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
