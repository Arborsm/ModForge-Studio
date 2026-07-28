import { useId, useState } from 'react'
import { AlertTriangle, CircleAlert, FolderOpen } from 'lucide-react'
import { useCpMakerPort } from '@features/cp-maker/provider'
import { useAssetAuthoringCopy, useEditorCopy } from '@locales/provider'
import type { AssetIssue } from '@entities/asset-schema'
import { countAssetIssues } from '@entities/asset-schema'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

interface ExportDialogProps {
  open: boolean
  draftName: string
  fileList: string[]
  /** Preflight findings for the whole draft; errors block the export. */
  issues: readonly AssetIssue[]
  onClose: () => void
  onExport: (outputPath: string) => Promise<void>
}

export function ExportDialog({ open, draftName, fileList, issues, onClose, onExport }: ExportDialogProps) {
  const copy = useEditorCopy().studioDesk.exportDialog
  const issueCopy = useAssetAuthoringCopy().issues
  const titleId = useId()
  const port = useCpMakerPort()
  const [outputPath, setOutputPath] = useState('')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const counts = countAssetIssues(issues)
  const blocking = counts.errors > 0
  const shownIssues = issues.filter((issue) => issue.severity !== 'info').slice(0, 20)

  function handleClose() {
    if (exporting) {
      return
    }
    onClose()
  }

  async function handleSelectDirectory() {
    const selected = await port.chooseDirectory(copy.selectDirectory)
    if (selected) {
      setOutputPath(selected)
      setError(null)
    }
  }

  async function handleExport() {
    if (!outputPath.trim() || blocking) return
    setExporting(true)
    setError(null)
    try {
      await onExport(outputPath.trim())
      setOutputPath('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} size="md" labelledBy={titleId} closeOnBackdrop={!exporting} closeOnEscape={!exporting}>
      <DialogHeader title={copy.title} onClose={handleClose} closeLabel={copy.cancel} closeDisabled={exporting} id={titleId} />
      <DialogBody>
        <div className="space-y-3">
          <div className="rounded-lg border border-(--border-color) bg-(--bg-panel-muted) px-3 py-2">
            <div className="text-xs text-(--text-secondary)">{copy.project}</div>
            <div className="text-sm font-medium text-(--text-primary)">{draftName}</div>
          </div>

          <div className="rounded-lg border border-(--border-color) bg-(--bg-panel-muted) px-3 py-2">
            <div className="text-xs font-medium text-(--text-primary)">{copy.preflightTitle}</div>
            {counts.total === 0 ? (
              <p className="mt-1 text-xs text-(--text-secondary)">{copy.preflightOk}</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-(--text-secondary)">
                  {blocking ? copy.preflightBlocked(counts.errors) : copy.preflightWarnings(counts.warnings)}
                </p>
                <ul className="mt-1.5 max-h-32 space-y-1 overflow-auto">
                  {shownIssues.map((issue, index) => (
                    <li key={`${issue.code}:${index}`} className="flex items-start gap-1.5 text-xs text-(--text-primary)">
                      {issue.severity === 'error' ? (
                        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--danger)" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--accent)" aria-hidden="true" />
                      )}
                      <span>{issueCopy[issue.messageKey](issue.params ?? {})}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div>
            <span className="mb-1 block text-xs text-(--text-secondary)">{copy.outputDirectory}</span>
            <div className="flex gap-2">
              <input
                type="text"
                className="min-w-0 flex-1 rounded-md border border-(--border-color) bg-(--bg-app) px-3 py-2 text-xs text-(--text-primary) outline-none focus:border-(--accent)"
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
              />
              <button type="button" className="control-button shrink-0 text-xs" onClick={handleSelectDirectory}>
                <FolderOpen className="mr-1 inline h-3.5 w-3.5" />
                {copy.browse}
              </button>
            </div>
          </div>

          {error ? <p className="app-dialog-error">{error}</p> : null}

          <div className="rounded-lg border border-(--border-color) bg-(--bg-panel-muted) px-3 py-2">
            <div className="text-[10px] text-(--text-secondary)">{copy.filesToExport(fileList.length)}</div>
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-[10px] text-(--text-primary)">
              {fileList.map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={handleClose} disabled={exporting}>
          {copy.cancel}
        </DialogAction>
        <DialogAction tone="primary" disabled={!outputPath.trim() || exporting || blocking} onClick={handleExport}>
          {exporting ? copy.exporting : copy.export}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
