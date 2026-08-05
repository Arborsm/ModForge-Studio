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
          <div className="border-border-subtle bg-surface-panel-muted rounded-lg border px-3 py-2">
            <div className="text-text-secondary text-xs">{copy.project}</div>
            <div className="text-text-primary text-sm font-medium">{draftName}</div>
          </div>

          <div className="border-border-subtle bg-surface-panel-muted rounded-lg border px-3 py-2">
            <div className="text-text-primary text-xs font-medium">{copy.preflightTitle}</div>
            {counts.total === 0 ? (
              <p className="text-text-secondary mt-1 text-xs">{copy.preflightOk}</p>
            ) : (
              <>
                <p className="text-text-secondary mt-1 text-xs">
                  {blocking ? copy.preflightBlocked(counts.errors) : copy.preflightWarnings(counts.warnings)}
                </p>
                <ul className="mt-1.5 max-h-32 space-y-1 overflow-auto">
                  {shownIssues.map((issue, index) => (
                    <li key={`${issue.code}:${index}`} className="text-text-primary flex items-start gap-1.5 text-xs">
                      {issue.severity === 'error' ? (
                        <CircleAlert className="text-danger mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="text-accent mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <span>{issueCopy[issue.messageKey](issue.params ?? {})}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div>
            <span className="text-text-secondary mb-1 block text-xs">{copy.outputDirectory}</span>
            <div className="flex gap-2">
              <input
                type="text"
                className="border-border-subtle bg-surface-app text-text-primary focus:border-accent min-w-0 flex-1 rounded-md border px-3 py-2 text-xs outline-none"
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

          <div className="border-border-subtle bg-surface-panel-muted rounded-lg border px-3 py-2">
            <div className="text-text-secondary text-caption-px">{copy.filesToExport(fileList.length)}</div>
            <ul className="text-text-primary text-caption-px mt-1 max-h-32 space-y-0.5 overflow-auto">
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
