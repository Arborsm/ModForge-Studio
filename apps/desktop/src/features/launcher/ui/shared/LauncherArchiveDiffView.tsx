import { useState } from 'react'
import type { LauncherArchiveFileDiff, LauncherArchiveModRootInfo } from '../../model/launcherContracts'
import { planArchiveModRootInstall } from '../../model/archiveInstallPlan'
import { formatSizeDelta, formatTimestampMs, parseUnifiedDiff, splitForDisplay } from '../../model/unifiedDiff'
import { useEditorCopy, useLocale } from '@locales/provider'
import { formatBytes } from '@shared/lib/formatting'
import { LauncherArchiveStatusBadge } from './LauncherArchiveStatusBadge'

type LauncherArchiveDiffViewProps = {
  roots: LauncherArchiveModRootInfo[]
}

/** Per-group display cap for changed-file rows (backend caps at 300/root). */
const MAX_FILES_PER_GROUP = 50
/** Per-file display cap for unified diff lines (backend caps at 500/file). */
const MAX_DIFF_LINES_PER_FILE = 120

const CHANGE_LABEL_KEYS = {
  added: 'diffChangeAdded',
  removed: 'diffChangeRemoved',
  changed: 'diffChangeChanged',
} as const

/**
 * Git-style file diff list for one archive whose every detected mod root
 * already exists in the Mods folder (pure update/reinstall/downgrade). Replaces
 * the plain file tree in the archive preview dialog; groups by mod root and
 * renders per-file unified diffs for text changes and size/mtime metadata for
 * binary changes. Long lists and long diffs are folded with expand/collapse
 * toggles; content flows in the dialog body (single scroll context).
 */
export function LauncherArchiveDiffView({ roots }: LauncherArchiveDiffViewProps) {
  return (
    <div className="launcher-install-diff-view">
      {roots.map((root) => (
        <DiffRootGroup key={root.path} root={root} />
      ))}
    </div>
  )
}

function DiffRootGroup({ root }: { root: LauncherArchiveModRootInfo }) {
  const copy = useEditorCopy().launcher
  const [filesExpanded, setFilesExpanded] = useState(false)
  const plan = planArchiveModRootInstall(root.manifestVersion, root.existingVersion, Boolean(root.existingUniqueId))
  const summary = root.diffSummary
  const files = summary?.files ?? []
  const fileFold = filesExpanded ? { visible: files, hiddenCount: 0 } : splitForDisplay(files, MAX_FILES_PER_GROUP)
  const truncatedFileCount = summary?.truncatedFileCount ?? 0

  return (
    <section className="launcher-install-diff-group">
      <header className="launcher-install-diff-group-head">
        <span className="launcher-install-root-path">{root.path}</span>
        <LauncherArchiveStatusBadge status={plan.status} />
      </header>

      {!summary ? (
        <p className="launcher-install-diff-empty">{copy.library.diffUnavailable}</p>
      ) : files.length === 0 ? (
        <p className="launcher-install-diff-empty">{copy.library.diffNoChanges}</p>
      ) : (
        <div className="launcher-install-diff-files">
          {fileFold.visible.map((file) => (
            <DiffFileRow key={`${file.changeKind}:${file.path}`} file={file} />
          ))}
          {fileFold.hiddenCount > 0 || filesExpanded ? (
            <button type="button" className="launcher-install-diff-toggle" onClick={() => setFilesExpanded((expanded) => !expanded)}>
              {filesExpanded ? copy.library.diffCollapse : copy.library.diffExpandFiles(fileFold.hiddenCount)}
            </button>
          ) : null}
          {truncatedFileCount > 0 ? <p className="launcher-install-diff-more">{copy.library.diffMoreFiles(truncatedFileCount)}</p> : null}
        </div>
      )}
    </section>
  )
}

function DiffFileRow({ file }: { file: LauncherArchiveFileDiff }) {
  const copy = useEditorCopy().launcher
  const locale = useLocale()
  const [linesExpanded, setLinesExpanded] = useState(false)
  const changeLabel = copy.library[CHANGE_LABEL_KEYS[file.changeKind]]

  const sizeLabel =
    file.changeKind === 'added'
      ? file.newSize != null
        ? formatBytes(file.newSize)
        : null
      : file.changeKind === 'removed'
        ? file.oldSize != null
          ? formatBytes(file.oldSize)
          : null
        : null

  const diffLines = file.textDiff ? parseUnifiedDiff(file.textDiff) : []
  const lineFold = linesExpanded ? { visible: diffLines, hiddenCount: 0 } : splitForDisplay(diffLines, MAX_DIFF_LINES_PER_FILE)

  return (
    <article className="launcher-install-diff-file" data-kind={file.changeKind}>
      <header className="launcher-install-diff-file-head">
        <span className="launcher-install-diff-badge" data-kind={file.changeKind}>
          {changeLabel}
        </span>
        <span className="launcher-install-diff-file-path">{file.path}</span>
        {sizeLabel ? <span className="launcher-install-diff-file-size">{sizeLabel}</span> : null}
      </header>

      {file.changeKind === 'changed' && diffLines.length > 0 ? (
        <div className="launcher-install-diff-lines">
          {lineFold.visible.map((line, index) => (
            <div key={`${index}:${line.kind}:${line.text.length}`} className="launcher-install-diff-line" data-kind={line.kind}>
              {line.text}
            </div>
          ))}
          {lineFold.hiddenCount > 0 || linesExpanded ? (
            <button type="button" className="launcher-install-diff-toggle" onClick={() => setLinesExpanded((expanded) => !expanded)}>
              {linesExpanded ? copy.library.diffCollapse : copy.library.diffExpandLines(lineFold.hiddenCount)}
            </button>
          ) : null}
          {file.textDiffTruncated ? <p className="launcher-install-diff-more">{copy.library.diffTruncatedHint}</p> : null}
        </div>
      ) : null}

      {file.changeKind === 'changed' && diffLines.length === 0 ? (
        <div className="launcher-install-diff-file-meta">
          {file.oldModifiedMs != null || file.newModifiedMs != null ? (
            <span>
              <span className="launcher-install-diff-meta-label">{copy.library.diffModifiedLabel}</span>
              <span className="launcher-install-diff-meta-value">
                {copy.library.diffModifiedChange(
                  formatTimestampMs(file.oldModifiedMs, locale) ?? '—',
                  formatTimestampMs(file.newModifiedMs, locale) ?? '—',
                )}
              </span>
            </span>
          ) : null}
          {file.oldSize != null || file.newSize != null ? (
            <span>
              <span className="launcher-install-diff-meta-label">{copy.library.diffSizeLabel}</span>
              <span className="launcher-install-diff-meta-value">
                {copy.library.diffSizeChange(
                  file.oldSize != null ? formatBytes(file.oldSize) : '—',
                  file.newSize != null ? formatBytes(file.newSize) : '—',
                  formatSizeDelta(file.oldSize, file.newSize),
                )}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
