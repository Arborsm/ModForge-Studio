import { useState } from 'react'
import { X, FolderOpen } from 'lucide-react'
import { useGeneratedProjectPort } from '../model/useGeneratedProjectPort'
import type { EditorCopy } from '../../../locales'

interface ExportDialogProps {
  open: boolean
  copy: EditorCopy['studioDesk']['exportDialog']
  draftName: string
  fileList: string[]
  onClose: () => void
  onExport: (outputPath: string) => Promise<void>
}

export function ExportDialog({ open, copy, draftName, fileList, onClose, onExport }: ExportDialogProps) {
  const port = useGeneratedProjectPort()
  const [outputPath, setOutputPath] = useState('')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div
        className="w-[480px] max-w-[90vw] rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{copy.title}</span>
          <button type="button" className="icon-button h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3 py-2">
            <div className="text-xs text-[var(--text-secondary)]">{copy.project}</div>
            <div className="text-sm font-medium text-[var(--text-primary)]">{draftName}</div>
          </div>

          <div>
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">{copy.outputDirectory}</span>
            <div className="flex gap-2">
              <input
                type="text"
                className="min-w-0 flex-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
              />
              <button
                type="button"
                className="control-button shrink-0 text-xs"
                onClick={handleSelectDirectory}
              >
                <FolderOpen className="mr-1 inline h-3.5 w-3.5" />
                {copy.browse}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
          ) : null}

          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3 py-2">
            <div className="text-[10px] text-[var(--text-secondary)]">{copy.filesToExport(fileList.length)}</div>
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-[10px] text-[var(--text-primary)]">
              {fileList.map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="control-button text-xs" onClick={onClose}>
              {copy.cancel}
            </button>
            <button
              type="button"
              className="control-button control-button-primary text-xs"
              disabled={!outputPath.trim() || exporting}
              onClick={handleExport}
            >
              {exporting ? copy.exporting : copy.export}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
