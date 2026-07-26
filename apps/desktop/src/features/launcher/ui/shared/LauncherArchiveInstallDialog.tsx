import { useId } from 'react'
import { AlertTriangle, File, FileArchive, Folder, PackageOpen } from 'lucide-react'
import type { InspectLauncherArchiveResult, LauncherArchiveTreeNode } from '../../model/launcherContracts'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { formatBytesOrPlaceholder } from '@shared/lib/formatting'
import { LauncherInstallStateView } from './LauncherInstallStateView'

type LauncherArchiveInstallDialogProps = {
  open: boolean
  loading: boolean
  installing: boolean
  previews: InspectLauncherArchiveResult[]
  selectedArchivePath: string | null
  error: string | null
  onClose: () => void
  onConfirm: () => void
  onSelectArchive: (archivePath: string) => void
}

function ArchiveTreeNode({ node }: { node: LauncherArchiveTreeNode }) {
  return (
    <div className="launcher-install-tree-node">
      <div className="launcher-install-tree-row" data-kind={node.isDirectory ? 'directory' : 'file'}>
        <span className="launcher-install-tree-icon" aria-hidden="true">
          {node.isDirectory ? <Folder className="h-3.5 w-3.5" /> : <File className="h-3.5 w-3.5" />}
        </span>
        <span className="launcher-install-tree-name">{node.name}</span>
        <span className="launcher-install-tree-size">{formatBytesOrPlaceholder(node.sizeBytes, 'dir')}</span>
      </div>

      {node.children.length ? (
        <div className="launcher-install-tree-children">
          {node.children.map((child) => (
            <ArchiveTreeNode key={child.path} node={child} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function LauncherArchiveInstallDialog({
  open,
  loading,
  installing,
  previews,
  selectedArchivePath,
  error,
  onClose,
  onConfirm,
  onSelectArchive,
}: LauncherArchiveInstallDialogProps) {
  const copy = useEditorCopy().launcher
  const titleId = useId()
  const selectedPreview = previews.find((preview) => preview.archivePath === selectedArchivePath) ?? previews[0] ?? null
  const totalModRoots = previews.reduce((sum, preview) => sum + preview.modRoots.length, 0)
  const handleClose = () => {
    if (installing) {
      return
    }
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} size="full" labelledBy={titleId} closeOnBackdrop={!installing} closeOnEscape={!installing}>
      <DialogHeader
        icon={<PackageOpen className="h-4 w-4" />}
        title={copy.library.previewTitle}
        subtitle={selectedPreview?.archiveFileName ?? copy.library.previewSubtitle}
        onClose={handleClose}
        closeLabel={copy.actions.closeDialog}
        closeDisabled={installing}
        id={titleId}
      />

      <DialogBody>
        {loading ? <LauncherInstallStateView tone="loading" title={copy.library.previewLoading} /> : null}

        {!loading && error ? <LauncherInstallStateView tone="error" title={copy.library.previewError} detail={error} /> : null}

        {!loading && !error && selectedPreview ? (
          <div className="launcher-install-preview">
            <aside className="launcher-install-preview-rail">
              <div className="launcher-install-section-head">
                <h3>{copy.library.previewArchiveListTitle}</h3>
                <span>{previews.length}</span>
              </div>
              <div className="launcher-install-archive-list">
                {previews.map((preview) => {
                  const selected = preview.archivePath === selectedPreview.archivePath
                  return (
                    <button
                      key={preview.archivePath}
                      type="button"
                      className={cx('launcher-install-archive-item', selected && 'is-active')}
                      onClick={() => onSelectArchive(preview.archivePath)}
                    >
                      <span className="launcher-install-archive-item-icon" aria-hidden="true">
                        <FileArchive className="h-4 w-4" />
                      </span>
                      <span className="launcher-install-archive-item-main">
                        <strong>{preview.archiveFileName}</strong>
                        <span>{copy.library.previewArchiveMeta(preview.totalEntries, preview.totalFiles)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="launcher-install-preview-rail-hint">{copy.library.previewArchiveListSubtitle}</p>
            </aside>

            <section className="launcher-install-preview-detail">
              <header className="launcher-install-preview-detail-head">
                <h3 className="launcher-install-preview-title">{selectedPreview.archiveFileName}</h3>
                <p className="launcher-install-preview-path">{selectedPreview.archivePath}</p>
              </header>

              <div className="launcher-install-metric-row">
                <div className="launcher-install-metric">
                  <strong>{selectedPreview.totalEntries}</strong>
                  <span>{copy.library.previewEntries}</span>
                </div>
                <div className="launcher-install-metric">
                  <strong>{selectedPreview.totalFiles}</strong>
                  <span>{copy.library.previewFiles}</span>
                </div>
                <div className="launcher-install-metric">
                  <strong>{selectedPreview.modRoots.length}</strong>
                  <span>{copy.library.previewRoots}</span>
                </div>
              </div>

              <section className="launcher-install-preview-section">
                <div className="launcher-install-section-head">
                  <h3>{copy.library.previewRoots}</h3>
                  <span>{selectedPreview.modRoots.length}</span>
                </div>
                {selectedPreview.modRoots.length ? (
                  <ul className="launcher-install-root-list">
                    {selectedPreview.modRoots.map((root) => (
                      <li key={root}>
                        <span className="launcher-install-root-dot" aria-hidden="true" />
                        <span className="launcher-install-root-path">{root}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="launcher-install-root-empty">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{copy.library.previewNoRoots}</span>
                  </p>
                )}
              </section>

              <section className="launcher-install-preview-section">
                <div className="launcher-install-section-head">
                  <h3>{copy.library.previewContentsTitle}</h3>
                  <span>{copy.library.previewArchiveMeta(selectedPreview.totalEntries, selectedPreview.totalFiles)}</span>
                </div>
                <div className="launcher-install-tree">
                  {selectedPreview.tree.map((node) => (
                    <ArchiveTreeNode key={node.path} node={node} />
                  ))}
                </div>
              </section>
            </section>
          </div>
        ) : null}
      </DialogBody>

      <DialogFooter align="between">
        {previews.length ? (
          <p className="launcher-install-footer-summary">{copy.library.previewSelectionSummary(previews.length, totalModRoots)}</p>
        ) : null}
        <div className="launcher-install-footer-actions">
          <DialogAction onClick={handleClose} disabled={installing}>
            {copy.actions.closeDialog}
          </DialogAction>
          <DialogAction tone="primary" disabled={!previews.length || loading || installing} onClick={onConfirm}>
            {copy.actions.install}
          </DialogAction>
        </div>
      </DialogFooter>
    </Dialog>
  )
}
