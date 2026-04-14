import { FileArchive, FileJson, FolderTree } from 'lucide-react'
import type { InspectLauncherArchiveResult, LauncherArchiveTreeNode } from '../../../lib/desktop'
import { useEditorCopy } from '../../../lib/app/localeContext'
import { PanelEmptyState, PanelSection } from '../../ui/PanelSection'
import { formatBytesOrPlaceholder } from '../../byteSize'

type LauncherArchiveInstallDialogProps = {
  open: boolean
  loading: boolean
  installing: boolean
  preview: InspectLauncherArchiveResult | null
  error: string | null
  onClose: () => void
  onConfirm: () => void
}

function ArchiveTreeNode({ node, depth = 0 }: { node: LauncherArchiveTreeNode; depth?: number }) {
  return (
    <div className="launcher-archive-node">
      <div className="launcher-archive-node-row" style={{ paddingLeft: `${depth * 14}px` }}>
        <span className="launcher-archive-node-icon">
          {node.isDirectory ? <FolderTree className="h-4 w-4" /> : <FileJson className="h-4 w-4" />}
        </span>
        <span className="launcher-archive-node-name">{node.name}</span>
        <span className="launcher-archive-node-size">{formatBytesOrPlaceholder(node.sizeBytes, 'dir')}</span>
      </div>

      {node.children.length ? (
        <div className="launcher-archive-node-children">
          {node.children.map((child) => (
            <ArchiveTreeNode key={child.path} node={child} depth={depth + 1} />
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
  preview,
  error,
  onClose,
  onConfirm,
}: LauncherArchiveInstallDialogProps) {
  const copy = useEditorCopy().launcher

  if (!open) {
    return null
  }

  return (
    <div className="launcher-modal-backdrop" role="presentation">
      <section className="launcher-modal panel-surface" role="dialog" aria-modal="true" aria-label={copy.library.previewTitle}>
        <header className="panel-header">
          <div className="min-w-0">
            <p className="panel-title">{copy.library.previewTitle}</p>
            <p className="panel-subtitle">{preview?.archiveFileName ?? copy.library.previewSubtitle}</p>
          </div>
          <div className="launcher-header-actions">
            <button type="button" className="control-button" onClick={onClose}>
              {copy.actions.closeDialog}
            </button>
            <button
              type="button"
              className="control-button control-button-primary"
              disabled={!preview || loading || installing}
              onClick={onConfirm}
            >
              {copy.actions.install}
            </button>
          </div>
        </header>

        <div className="panel-body">
          {loading ? (
            <div className="launcher-modal-content">
              <PanelEmptyState>{copy.library.previewLoading}</PanelEmptyState>
            </div>
          ) : null}

          {!loading && error ? (
            <div className="launcher-modal-content">
              <PanelEmptyState>{error || copy.library.previewError}</PanelEmptyState>
            </div>
          ) : null}

          {!loading && !error && preview ? (
            <div className="launcher-modal-content launcher-archive-preview-grid">
              <PanelSection title={copy.library.previewTitle} subtitle={copy.library.previewSubtitle}>
                <div className="launcher-stats-row">
                  <div className="launcher-stat-card">
                    <span>{copy.library.previewEntries}</span>
                    <strong>{preview.totalEntries}</strong>
                  </div>
                  <div className="launcher-stat-card">
                    <span>{copy.library.previewFiles}</span>
                    <strong>{preview.totalFiles}</strong>
                  </div>
                  <div className="launcher-stat-card">
                    <span>{copy.library.previewRoots}</span>
                    <strong>{preview.modRoots.length}</strong>
                  </div>
                </div>

                <div className="launcher-archive-root-list">
                  {preview.modRoots.length ? (
                    preview.modRoots.map((root) => (
                      <span key={root} className="dock-chip">
                        <FileArchive className="h-3 w-3" />
                        <span>{root}</span>
                      </span>
                    ))
                  ) : (
                    <PanelEmptyState>{copy.library.previewNoRoots}</PanelEmptyState>
                  )}
                </div>
              </PanelSection>

              <PanelSection title={preview.archiveFileName} subtitle={preview.archivePath}>
                <div className="launcher-archive-tree">
                  {preview.tree.map((node) => (
                    <ArchiveTreeNode key={node.path} node={node} />
                  ))}
                </div>
              </PanelSection>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
