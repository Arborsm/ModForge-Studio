import { useEffect, useRef, useState, type HTMLAttributes } from 'react'
import { Search, Upload, ImageOff, Loader2 } from 'lucide-react'
import { useSelectionContainer, type Box } from '@air/react-drag-to-select'
import type { ProjectAssetRef } from '@features/cp-maker'
import { useMapAuthoringCopy } from '@locales/provider'
import { appEvent } from '@platform/observability'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { TaskCancelledError } from '@shared/lib/task-runtime'
import { publishNotification } from '@shared/ui/notifications'
import { AssetImageThumbnail } from '../../../asset-library/ui/AssetImageThumbnail'
import { classifyProjectAsset } from '../../../asset-library/model/projectAssets'
import { useWorkbenchProject } from '../../../../model/workbenchModuleContexts'

export type TilesheetImportDialogProps = {
  open: boolean
  onClose: () => void
  imageAssets: readonly ProjectAssetRef[]
  attachedImagePaths: ReadonlySet<string>
  onAttach: (paths: string[]) => void | Promise<void>
}

export function TilesheetImportDialog({ open, onClose, imageAssets, attachedImagePaths, onAttach }: TilesheetImportDialogProps) {
  const copy = useMapAuthoringCopy().assetEditor
  const project = useWorkbenchProject()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  // State (not a ref) so useSelectionContainer re-receives the element after mount.
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const visibleAssets = imageAssets.filter((asset) => {
    const text = `${asset.relativePath} ${asset.relativePath.split('/').pop() ?? ''}`.toLowerCase()
    return text.includes(query.trim().toLowerCase())
  })

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(new Set())
    }
  }, [open])

  function selectByBox(box: Box) {
    const paths = Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[data-tilesheet-import-card]') ?? [])
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return box.left <= rect.right && box.left + box.width >= rect.left && box.top <= rect.bottom && box.top + box.height >= rect.top
      })
      .map((element) => element.dataset.path)
      .filter((path): path is string => Boolean(path))
    setSelected(new Set(paths))
  }

  const { DragSelection } = useSelectionContainer<HTMLDivElement>({
    eventsElement: gridElement,
    isEnabled: open,
    isValidSelectionStart: () => true,
    onSelectionChange: selectByBox,
    selectionProps: { className: 'tilesheet-import-box-select' } as HTMLAttributes<HTMLDivElement>,
    shouldStartSelecting: (target) => target instanceof HTMLElement && !target.closest('[data-tilesheet-import-card]'),
  })

  async function importFromDisk() {
    setImporting(true)
    try {
      const paths = await project.chooseFiles(copy.tilesheetImportChooseFiles, [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
      ])
      if (paths.length === 0) return
      const previous = new Set(imageAssets.map((asset) => asset.relativePath.toLowerCase()))
      const imported = await project.importProjectAssets(paths, 'assets')
      const newPaths = imported.projectAssets
        .filter(
          (asset) =>
            classifyProjectAsset(asset.mediaType, asset.relativePath) === 'image' && !previous.has(asset.relativePath.toLowerCase()),
        )
        .map((asset) => asset.relativePath)
      setSelected((current) => new Set([...current, ...newPaths]))
      if (newPaths.length === 0) {
        publishNotification({ id: 'tilesheet-import-no-new', level: 'info', title: copy.tilesheetImportNoNew })
      } else {
        requestAnimationFrame(() => {
          const firstNewCard = Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[data-tilesheet-import-card]') ?? []).find(
            (card) => newPaths.includes(card.dataset.path ?? ''),
          )
          firstNewCard?.scrollIntoView({ block: 'nearest' })
        })
      }
    } catch (error) {
      if (error instanceof TaskCancelledError) return
      appEvent('error', copy.tilesheetImportFailed)
        .error(error)
        .context({ source: 'tilesheet-import-dialog', operation: 'import-from-disk' })
        .emit()
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg" className="tilesheet-import-dialog">
      <DialogHeader title={copy.tilesheetImportTitle} onClose={onClose} closeLabel={copy.tilesheetImportCancel} />
      <div className="tilesheet-import-toolbar">
        <label className="tilesheet-import-search">
          <Search className="h-4 w-4" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.tilesheetImportSearch} autoFocus />
        </label>
        <span>{copy.tilesheetImportSelected(selected.size)}</span>
      </div>
      <DialogBody className="tilesheet-import-body">
        <div
          ref={(node) => {
            gridRef.current = node
            setGridElement((current) => (current === node ? current : node))
          }}
          className="tilesheet-import-grid"
        >
          {visibleAssets.length === 0 ? <p className="tilesheet-import-empty">{copy.tilesheetImportEmpty}</p> : null}
          {visibleAssets.map((asset) => {
            const path = asset.relativePath
            const isSelected = selected.has(path)
            return (
              <button
                key={path}
                type="button"
                data-tilesheet-import-card="true"
                data-path={path}
                className={`tilesheet-import-card${isSelected ? ' is-selected' : ''}`}
                onClick={(event) => {
                  setSelected((current) => {
                    if (event.ctrlKey || event.metaKey) {
                      const next = new Set(current)
                      if (next.has(path)) next.delete(path)
                      else next.add(path)
                      return next
                    }
                    return new Set([path])
                  })
                }}
              >
                <AssetImageThumbnail
                  assetPath={path}
                  sha256={asset.sha256}
                  mediaType={asset.mediaType}
                  fallback={<ImageOff className="h-5 w-5" />}
                />
                <span>{path.split('/').pop() ?? path}</span>
                {attachedImagePaths.has(path) ? <small>{copy.tilesheetImportAttached}</small> : null}
              </button>
            )
          })}
          <DragSelection />
        </div>
      </DialogBody>
      <DialogFooter align="between">
        <DialogAction onClick={() => void importFromDisk()} disabled={importing}>
          {importing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
          {copy.tilesheetImportFromDisk}
        </DialogAction>
        <span className="tilesheet-import-actions">
          <DialogAction onClick={onClose}>{copy.tilesheetImportCancel}</DialogAction>
          <DialogAction
            tone="primary"
            disabled={selected.size === 0}
            onClick={async () => {
              await onAttach([...selected])
              onClose()
            }}
          >
            {copy.tilesheetImportConfirm(selected.size)}
          </DialogAction>
        </span>
      </DialogFooter>
    </Dialog>
  )
}
