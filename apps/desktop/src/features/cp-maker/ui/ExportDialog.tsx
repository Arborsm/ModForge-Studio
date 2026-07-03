import { useId, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { useCpMakerPort } from '@features/cp-maker/provider'
import { useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

interface ExportDialogProps {
  open: boolean
  draftName: string
  fileList: string[]
  onClose: () => void
  onExport: (outputPath: string) => Promise<void>
}

export function ExportDialog({ open, draftName, fileList, onClose, onExport }: ExportDialogProps) {
  const copy = useEditorCopy().studioDesk.exportDialog
  const titleId = useId()
  const port = useCpMakerPort()
  const [outputPath, setOutputPath] = useState('')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    if (!outputPath.trim()) return
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
        <DialogAction tone="primary" disabled={!outputPath.trim() || exporting} onClick={handleExport}>
          {exporting ? copy.exporting : copy.export}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
