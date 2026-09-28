/**
 * @file Runtime log viewer: the shared log-tail view plus its two shells — a
 * Dialog for desktop and a full-screen mobile page opened through the
 * mobile page stack (configuration page → 查看日志).
 */

import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { readLauncherLog } from '@features/launcher/api'
import type { LauncherLogPage } from '@features/launcher/api'
import { useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { publishNotification } from '@shared/ui/notifications'

const LOG_DIALOG_NOTIFICATION_ID = 'launcher-log-viewer'

type LauncherLogViewProps = {
  /** Reloads the tail whenever this turns true after being false. */
  active: boolean
}

/** Shared log-tail body: loads on activation, refresh + copy actions included. */
export function LauncherLogView({ active }: LauncherLogViewProps) {
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
    if (active) {
      void loadLog()
    }
  }, [active, loadLog])

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
    <div className="launcher-log-view">
      <div className="launcher-log-view-tools">
        <button type="button" className="launcher-config-button" onClick={() => void loadLog()} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" />
          {copy.logViewer.refresh}
        </button>
        <button
          type="button"
          className="launcher-config-button launcher-config-button-brand"
          onClick={() => void handleCopy()}
          disabled={!page?.lines.length}
        >
          {copied ? copy.logViewer.copyDone : copy.logViewer.copy}
        </button>
      </div>
      <pre className="launcher-log-dialog-output" data-loading={loading ? 'true' : undefined}>
        {page?.lines.length ? page.lines.join('\n') : copy.logViewer.empty}
      </pre>
      {page?.truncated ? <p className="launcher-log-dialog-note">{copy.logViewer.truncatedDetail(page.lines.length)}</p> : null}
    </div>
  )
}

/** Desktop shell: the log view inside the standard dialog chrome. */
export function LauncherLogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const launcherCopy = useEditorCopy().launcher
  const copy = launcherCopy.configuration

  return (
    <Dialog open={open} onClose={onClose} size="xl" ariaLabel={copy.logViewer.title}>
      <DialogHeader
        title={copy.logViewer.title}
        subtitle={copy.logViewer.subtitle}
        closeLabel={launcherCopy.actions.closeDialog}
        onClose={onClose}
      />
      <DialogBody>
        <LauncherLogView active={open} />
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{launcherCopy.actions.closeDialog}</DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
