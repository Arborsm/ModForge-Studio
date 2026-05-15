import type { CSSProperties } from 'react'
import { FolderTree, Link2, ScrollText, X } from 'lucide-react'
import { useEffect } from 'react'
import { useEditorCopy } from '@locales/localeContext'
import { useLauncherPort } from '@features/launcher/model/launcherPortContext'
import type { LauncherLibraryItem } from '@features/launcher'
import { cx } from '@shared/lib/cx'
import { PanelEmptyState } from '@shared/ui/PanelSection'
import { LauncherArtworkCover } from './LauncherArtworkCover'
import { getLauncherCardCoverWord, getLauncherCardFallbackPalette } from './launcherCardPresentation'

type LauncherDetailMod = LauncherLibraryItem & {
  packName?: string | null
}

type LauncherModDetailPanelProps = {
  open: boolean
  onClose: () => void
  closeLabel: string
  title: string
  subtitle: string
  empty: string
  mod: LauncherDetailMod | null
  labels: {
    currentVersion: string
    uniqueId: string
    path: string
    dependencies: string
    updateKeys: string
    pack: string
  }
  noSummary: string
  onToggleEnabled: () => void
  enableLabel: string
  disableLabel: string
  enabledStateLabel: string
  disabledStateLabel: string
  openFolderLabel: string
  setCoverLabel: string
  clearCoverLabel: string
  onOpenFolder: () => void
  onSetCover: () => void
  onClearCover: () => void
  openModPageLabel?: string
  packName?: string | null
}

export function LauncherModDetailPanel({
  open,
  onClose,
  closeLabel,
  title,
  subtitle,
  empty,
  mod,
  labels,
  noSummary,
  onToggleEnabled,
  enableLabel,
  disableLabel,
  enabledStateLabel,
  disabledStateLabel,
  openFolderLabel,
  setCoverLabel,
  clearCoverLabel,
  onOpenFolder,
  onSetCover,
  onClearCover,
  openModPageLabel,
  packName,
}: LauncherModDetailPanelProps) {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy()
  const fallbackPalette = getLauncherCardFallbackPalette(mod?.name ?? title)
  const coverWord = getLauncherCardCoverWord(mod?.name ?? title)
  const coverStyle = {
    '--launcher-cover-bright': fallbackPalette.bright,
    '--launcher-cover-base': fallbackPalette.base,
    '--launcher-cover-dark': fallbackPalette.dark,
    '--launcher-cover-edge': fallbackPalette.edge,
    '--launcher-cover-glow': fallbackPalette.glow,
    '--launcher-cover-shadow': fallbackPalette.shadow,
  } as CSSProperties

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  return (
    <aside className={cx('launcher-library-drawer', open && 'launcher-library-drawer-open')} aria-hidden={!open}>
      <button
        type="button"
        className="launcher-library-drawer-backdrop"
        aria-label={closeLabel}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      />

      <section
        className="launcher-library-drawer-panel panel-surface panel-surface-muted"
        role="dialog"
        aria-modal="true"
        aria-label={mod?.name ?? title}
      >
        <header className="launcher-library-drawer-header">
          <div className="launcher-library-drawer-header-copy">
            <p className="launcher-page-shell-eyebrow">{title}</p>
            {mod ? (
              <>
                <h2 className="launcher-library-drawer-mod-name">{mod.name}</h2>
                <p className="launcher-library-drawer-title">{mod.author ?? subtitle}</p>
                <div className="launcher-library-drawer-header-chips">
                  <span className={`status-pill status-pill-compact ${mod.enabled ? 'status-pill-ready' : 'status-pill-idle'}`}>
                    {mod.enabled ? enabledStateLabel : disabledStateLabel}
                  </span>
                  {packName ? <span className="dock-chip">{packName}</span> : null}
                  {mod.nexusModId ? <span className="dock-chip">Nexus #{mod.nexusModId}</span> : null}
                </div>
              </>
            ) : (
              <p className="launcher-library-drawer-title">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            className="icon-button launcher-library-drawer-close"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="launcher-library-drawer-body">
          {!mod ? (
            <PanelEmptyState>{empty}</PanelEmptyState>
          ) : (
            <>
              <section className="launcher-detail-hero-card">
                <div className="launcher-detail-hero">
                  <LauncherArtworkCover
                    title={mod.name}
                    imageUrl={mod.imageUrl}
                    coverStyle={coverStyle}
                    coverWord={coverWord}
                    className="launcher-detail-cover"
                  />

                  <div className="launcher-detail-copy min-w-0">
                    <p className="launcher-detail-summary">{mod.description ?? noSummary}</p>
                  </div>
                </div>

                <div className="launcher-detail-actions-bar">
                  <button type="button" className="control-button launcher-detail-action-strong" onClick={onToggleEnabled}>
                    {mod.enabled ? disableLabel : enableLabel}
                  </button>
                  <button type="button" className="control-button launcher-detail-action" onClick={onOpenFolder}>
                    {openFolderLabel}
                  </button>
                  <button type="button" className="control-button launcher-detail-action" onClick={onSetCover}>
                    {setCoverLabel}
                  </button>
                  {mod.imageUrl ? (
                    <button type="button" className="control-button launcher-detail-action" onClick={onClearCover}>
                      {clearCoverLabel}
                    </button>
                  ) : null}
                  {mod.modUrl ? (
                    <a
                      className="control-button launcher-detail-action"
                      href={mod.modUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => {
                        event.preventDefault()
                        void launcherPort.openUrl({ url: mod.modUrl! })
                      }}
                    >
                      {openModPageLabel ?? copy.launcher.actions.openModPage}
                    </a>
                  ) : null}
                </div>
              </section>

              <section className="launcher-detail-meta-card">
                <div className="launcher-detail-section-head">
                  <div className="launcher-detail-section-heading">
                    <ScrollText className="h-4 w-4" />
                    <p className="launcher-page-shell-eyebrow">{labels.currentVersion}</p>
                  </div>
                  <p className="launcher-library-drawer-subtitle">{labels.pack}</p>
                </div>
                <div className="space-y-2">
                  <div className="kv-row compact-kv-row">
                    <span>{labels.currentVersion}</span>
                    <span>{mod.version ?? copy.common.none}</span>
                  </div>
                  <div className="kv-row compact-kv-row">
                    <span>{labels.uniqueId}</span>
                    <span>{mod.uniqueId ?? copy.common.none}</span>
                  </div>
                  {packName ? (
                    <div className="kv-row compact-kv-row">
                      <span>{labels.pack}</span>
                      <span>{packName}</span>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="launcher-detail-meta-card">
                <div className="launcher-detail-section-head">
                  <div className="launcher-detail-section-heading">
                    <FolderTree className="h-4 w-4" />
                    <p className="launcher-page-shell-eyebrow">{labels.path}</p>
                  </div>
                  <p className="launcher-library-drawer-subtitle">{openFolderLabel}</p>
                </div>
                <div className="space-y-2">
                  <div className="kv-row compact-kv-row">
                    <span>{labels.path}</span>
                    <span>{mod.absolutePath}</span>
                  </div>
                </div>
              </section>

              <section className="launcher-detail-meta-card">
                <div className="launcher-detail-section-head">
                  <div className="launcher-detail-section-heading">
                    <Link2 className="h-4 w-4" />
                    <p className="launcher-page-shell-eyebrow">{labels.dependencies}</p>
                  </div>
                  <p className="launcher-library-drawer-subtitle">{labels.updateKeys}</p>
                </div>
                <div className="space-y-2">
                  <div className="kv-row compact-kv-row">
                    <span>{labels.dependencies}</span>
                    <span>{mod.missingRequiredDependencies.length ? mod.missingRequiredDependencies.join(', ') : copy.common.none}</span>
                  </div>
                  <div className="kv-row compact-kv-row">
                    <span>{labels.updateKeys}</span>
                    <span>{mod.updateKeys.length ? mod.updateKeys.join(', ') : copy.common.none}</span>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </section>
    </aside>
  )
}
