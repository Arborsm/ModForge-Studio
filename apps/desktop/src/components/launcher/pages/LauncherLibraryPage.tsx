import { useEffect, useMemo, useState } from 'react'
import { FolderArchive, FolderOpen, Play, RefreshCw, Search } from 'lucide-react'
import { useEditorCopy } from '../../../lib/app/localeContext'
import {
  chooseArchiveFile,
  chooseImageFile,
  getLauncherBackupDirectory,
  inspectLauncherArchive,
  openLauncherPath,
  setLauncherLibraryCover,
  type InspectLauncherArchiveResult,
} from '../../../lib/desktop'
import { cx } from '../../../lib/cx'
import type { LauncherLibraryItem, LauncherPackPreset, LauncherSettingsDraft } from '../../../lib/launcher/types'
import { useLauncherLibrary } from '../../../lib/launcher/useLauncherLibrary'
import { LauncherModCard } from '../cards/LauncherModCard'
import { LauncherModDetailPanel } from '../cards/LauncherModDetailPanel'
import { LauncherArchiveInstallDialog } from '../shared/LauncherArchiveInstallDialog'
import { LauncherStateBlock } from '../shared/LauncherStateBlock'

type LauncherLibraryPageProps = {
  settings: LauncherSettingsDraft
  launchGameLabel: string
  launchGameDisabled: boolean
  launchGameBusy: boolean
  onLaunchGame: () => void
}
type ArchivePreviewState = 'idle' | 'loading' | 'ready' | 'error'
type LibrarySortMode = 'name' | 'enabled-first' | 'pack'

const normalizeLookupKey = (value: string) => value.trim().toLowerCase()
const getModKey = (mod: LauncherLibraryItem) => (mod.uniqueId || mod.labelKey || mod.id).trim()
const shortenLibraryPath = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  const normalized = value.replaceAll('/', '\\')
  const parts = normalized.split('\\').filter(Boolean)
  if (parts.length <= 3) {
    return normalized
  }

  return `...\\${parts.slice(-3).join('\\')}`
}

function buildPackLookup(packPresets: LauncherPackPreset[]) {
  const lookup = new Map<string, LauncherPackPreset[]>()
  for (const pack of packPresets) {
    for (const modKey of pack.modKeys) {
      const normalized = normalizeLookupKey(modKey)
      if (!normalized) continue
      const existing = lookup.get(normalized)
      if (existing) existing.push(pack)
      else lookup.set(normalized, [pack])
    }
  }
  return lookup
}

function compareText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? '').localeCompare(right ?? '', undefined, { sensitivity: 'base' })
}

function sortLibraryMods(
  items: LauncherLibraryItem[],
  sortMode: LibrarySortMode,
  packLookup: Map<string, LauncherPackPreset[]>,
  currentPackId: string | null,
) {
  return [...items].sort((left, right) => {
    const leftKey = normalizeLookupKey(getModKey(left))
    const rightKey = normalizeLookupKey(getModKey(right))
    const leftPacks = packLookup.get(leftKey) ?? []
    const rightPacks = packLookup.get(rightKey) ?? []
    const leftPack =
      leftPacks.find((pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(currentPackId ?? ''))?.name ??
      leftPacks[0]?.name ??
      ''
    const rightPack =
      rightPacks.find((pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(currentPackId ?? ''))?.name ??
      rightPacks[0]?.name ??
      ''

    if (sortMode === 'enabled-first') {
      if (left.enabled !== right.enabled) return left.enabled ? -1 : 1
      return compareText(left.name, right.name)
    }
    if (sortMode === 'pack') return compareText(leftPack, rightPack) || compareText(left.name, right.name)
    return compareText(left.name, right.name)
  })
}

export function LauncherLibraryPage({
  settings,
  launchGameLabel,
  launchGameDisabled,
  launchGameBusy,
  onLaunchGame,
}: LauncherLibraryPageProps) {
  const copy = useEditorCopy().launcher
  const library = useLauncherLibrary(settings)
  const { refresh } = library
  const [archivePreviewState, setArchivePreviewState] = useState<ArchivePreviewState>('idle')
  const [archivePreview, setArchivePreview] = useState<InspectLauncherArchiveResult | null>(null)
  const [archivePreviewError, setArchivePreviewError] = useState<string | null>(null)
  const [installingArchive, setInstallingArchive] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<LibrarySortMode>('name')
  const [packActionId, setPackActionId] = useState('')
  const [dragSelectionIds, setDragSelectionIds] = useState<string[]>([])
  const [detailModId, setDetailModId] = useState<string | null>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const packLookup = useMemo(() => buildPackLookup(library.packPresets), [library.packPresets])
  const detailMod = useMemo(
    () => (detailModId ? library.mods.find((item) => item.id === detailModId) ?? null : null),
    [detailModId, library.mods],
  )

  useEffect(() => {
    if (detailModId && !detailMod) {
      setDetailModId(null)
    }
  }, [detailMod, detailModId])

  useEffect(() => {
    if (library.currentPackId && library.currentPackId !== packActionId) {
      setPackActionId(library.currentPackId)
      return
    }

    if (!packActionId && library.packPresets[0]?.id) {
      setPackActionId(library.packPresets[0].id)
    }
  }, [library.currentPackId, library.packPresets, packActionId])

  const sortedMods = useMemo(
    () => sortLibraryMods(library.filteredMods, sortMode, packLookup, library.currentPackId),
    [library.currentPackId, library.filteredMods, packLookup, sortMode],
  )
  const shortModsPath = useMemo(() => shortenLibraryPath(settings.modsPath), [settings.modsPath])

  const closeArchivePreview = () => {
    setArchivePreviewState('idle')
    setArchivePreview(null)
    setArchivePreviewError(null)
    setInstallingArchive(false)
  }

  const inspectArchive = async () => {
    const path = await chooseArchiveFile(copy.actions.chooseArchive)
    if (!path) {
      return
    }

    setArchivePreviewState('loading')
    setArchivePreview(null)
    setArchivePreviewError(null)

    try {
      setArchivePreview(await inspectLauncherArchive({ archivePath: path }))
      setArchivePreviewState('ready')
    } catch (nextError) {
      setArchivePreviewError(nextError instanceof Error ? nextError.message : copy.library.previewError)
      setArchivePreviewState('error')
    }
  }

  const confirmArchiveInstall = async () => {
    if (!archivePreview) {
      return
    }

    setInstallingArchive(true)

    try {
      await library.installArchive(archivePreview.archivePath)
      closeArchivePreview()
    } catch (nextError) {
      setArchivePreviewError(nextError instanceof Error ? nextError.message : copy.library.previewError)
      setArchivePreviewState('error')
    } finally {
      setInstallingArchive(false)
    }
  }

  const runLibraryAction = async (action: () => Promise<void>) => {
    setActionError(null)
    try {
      await action()
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : copy.library.empty)
    }
  }

  const openLibraryRoot = () =>
    runLibraryAction(async () => {
      if (!settings.modsPath) {
        throw new Error(copy.states.missingModsPath)
      }
      await openLauncherPath({ path: settings.modsPath })
    })

  const openBackupFolder = () =>
    runLibraryAction(async () => {
      await openLauncherPath({ path: await getLauncherBackupDirectory() })
    })

  const openSelectedModFolder = () =>
    runLibraryAction(async () => {
      if (!detailMod) {
        return
      }
      await openLauncherPath({ path: detailMod.absolutePath })
    })

  const setSelectedModCover = () =>
    runLibraryAction(async () => {
      if (!detailMod) {
        return
      }
      const imagePath = await chooseImageFile(copy.actions.setCover)
      if (!imagePath) {
        return
      }
      await setLauncherLibraryCover({ labelKey: detailMod.labelKey, imagePath })
      await library.refresh()
    })

  const clearSelectedModCover = () =>
    runLibraryAction(async () => {
      if (!detailMod) {
        return
      }
      await setLauncherLibraryCover({ labelKey: detailMod.labelKey, imagePath: null })
      await library.refresh()
    })

  const addSelectionToPack = (packId: string) =>
    runLibraryAction(async () => {
      if (!packId) {
        return
      }
      await library.addSelectionToPack(packId)
      await library.setCurrentPackId(packId)
    })

  const prepareDragSelection = (modId: string) => {
    library.setSelectedModId(modId)
    library.setSelectedModIds([modId])
    setDragSelectionIds([modId])
  }

  const focusModCard = (modId: string) => {
    library.setSelectedModId(modId)
  }

  const openModDetails = (modId: string) => {
    library.setSelectedModId(modId)
    setDetailModId(modId)
  }

  const closeModDetails = () => {
    setDetailModId(null)
  }

  const resolvePackName = (mod: LauncherLibraryItem) => {
    const modPacks = packLookup.get(normalizeLookupKey(getModKey(mod))) ?? []
    if (!modPacks.length) {
      return null
    }
    return (
      modPacks.find((pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(library.currentPackId ?? ''))?.name ??
      modPacks[0]?.name ??
      null
    )
  }

  return (
    <>
      <section className="launcher-library-page">
        <div className="launcher-library-topbar panel-section panel-section-muted">
          <div className="launcher-library-topbar-header">
            <div className="launcher-library-header-copy">
              <p className="launcher-page-shell-eyebrow">{copy.pages.library}</p>
              <div className="launcher-library-header-line">
                <h1 className="launcher-library-header-title">{copy.library.title}</h1>
                {shortModsPath ? (
                  <p className="launcher-library-header-subtitle" title={settings.modsPath ?? undefined}>
                    {shortModsPath}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="launcher-library-header-actions-shell">
              <div className="launcher-library-header-actions-group">
                <button type="button" className="control-button launcher-library-header-action" onClick={() => void library.refresh()}>
                  <RefreshCw className="h-4 w-4" />
                  <span>{copy.actions.refresh}</span>
                </button>
                <button type="button" className="control-button launcher-library-header-action" onClick={() => void openLibraryRoot()}>
                  <FolderOpen className="h-4 w-4" />
                  <span>{copy.actions.openStorageFolder}</span>
                </button>
                <button type="button" className="control-button launcher-library-header-action" onClick={() => void openBackupFolder()}>
                  <span>{copy.actions.openBackupFolder}</span>
                </button>
              </div>

              <button type="button" className="control-button launcher-library-header-action launcher-library-header-action-primary" onClick={() => void inspectArchive()}>
                <FolderArchive className="h-4 w-4" />
                <span>{copy.actions.installArchive}</span>
              </button>
            </div>
          </div>

          <div className="launcher-library-controls-row">
            <div className="launcher-library-tabs">
              <button type="button" className={cx('launcher-library-tab', !library.currentPack && 'launcher-library-tab-active')} onClick={() => void library.setCurrentPackId(null)}>
                <span>{copy.library.allPacks}</span>
              </button>
              {library.packPresets.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  aria-label={`${copy.library.packButtonLabel} ${pack.name}`}
                  className={cx(
                    'launcher-library-tab',
                    normalizeLookupKey(pack.id) === normalizeLookupKey(library.currentPackId ?? '') && 'launcher-library-tab-active',
                    dragSelectionIds.length > 0 && 'launcher-drop-target',
                  )}
                  onClick={() => void library.setCurrentPackId(pack.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    void addSelectionToPack(pack.id)
                    setDragSelectionIds([])
                  }}
                >
                  <span>{pack.name}</span>
                </button>
              ))}
            </div>

            <div className="launcher-library-toolbar-panel">
              <label className="control-input launcher-toolbar-input launcher-library-search launcher-library-toolbar-control">
                <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
                <input value={library.filterText} onChange={(event) => library.setFilterText(event.target.value)} placeholder={copy.fields.filterLibrary} spellCheck={false} />
              </label>

              <div className="launcher-scope-switch" role="group" aria-label={copy.library.scopeTitle}>
                <button type="button" className={cx('control-button launcher-library-toolbar-button', library.scopeMode === 'all' && 'control-button-primary')} onClick={() => void library.setScopeMode('all')}>
                  {copy.library.scopeAll}
                </button>
                <button
                  type="button"
                  className={cx('control-button launcher-library-toolbar-button', library.scopeMode === 'current-pack' && 'control-button-primary')}
                  onClick={() => void library.setScopeMode('current-pack')}
                >
                  {copy.library.scopeCurrentPack}
                </button>
              </div>

              <select className="control-input launcher-select launcher-library-toolbar-control" aria-label={copy.library.sortLabel} value={sortMode} onChange={(event) => setSortMode(event.target.value as LibrarySortMode)}>
                <option value="name">{copy.library.sortByName}</option>
                <option value="enabled-first">{copy.library.sortByEnabled}</option>
                <option value="pack">{copy.library.sortByPack}</option>
              </select>

              <button type="button" className={cx('control-button launcher-library-toolbar-button', library.enabledOnly && 'control-button-primary')} onClick={() => library.setEnabledOnly(!library.enabledOnly)}>
                <span>{copy.toggles.enabledOnly}</span>
              </button>

              <div className="launcher-library-toolbar-nav" role="group" aria-label={copy.fields.filterLibrary}>
                <button type="button" className="control-button launcher-library-toolbar-button launcher-toolbar-quiet" onClick={library.selectPreviousSearchMatch}>
                  <span>{copy.actions.searchPrevious}</span>
                </button>
                <button type="button" className="control-button launcher-library-toolbar-button launcher-toolbar-quiet" onClick={library.selectNextSearchMatch}>
                  <span>{copy.actions.searchNext}</span>
                </button>
              </div>

              <button type="button" className="control-button launcher-library-toolbar-button launcher-library-toolbar-apply" disabled={!library.currentPack} onClick={() => void runLibraryAction(library.applyCurrentPack)}>
                <span>{copy.actions.applyCurrentPack}</span>
              </button>
            </div>
          </div>
        </div>

        <div className={cx('launcher-library-browser', detailMod && 'launcher-library-browser-detail-open')}>
          <div className="launcher-library-browser-main">
            {actionError ? <LauncherStateBlock title={copy.library.title} detail={actionError} tone="warning" /> : null}
            {library.state === 'error' ? <LauncherStateBlock title={copy.library.title} detail={library.error ?? copy.library.empty} tone="warning" /> : null}
            {library.state !== 'error' && !sortedMods.length ? (
              <LauncherStateBlock title={settings.modsPath ? copy.library.filteredEmpty : copy.states.missingModsPath} detail={copy.library.subtitle} />
            ) : (
              <div className="launcher-library-grid">
                {sortedMods.map((item) => (
                  <LauncherModCard
                    key={item.id}
                    title={item.name}
                    author={item.author}
                    imageUrl={item.imageUrl}
                    enabled={item.enabled}
                    packName={resolvePackName(item)}
                    draggable
                    onSelect={() => focusModCard(item.id)}
                    onViewDetails={() => openModDetails(item.id)}
                    viewDetailsLabel={copy.actions.viewDetails}
                    onDragStart={() => prepareDragSelection(item.id)}
                    onDragEnd={() => setDragSelectionIds([])}
                  />
                ))}
              </div>
            )}
          </div>

          <LauncherModDetailPanel
            open={Boolean(detailMod)}
            onClose={closeModDetails}
            closeLabel={copy.actions.closeDialog}
            title={copy.library.detailsTitle}
            subtitle={copy.library.detailsSubtitle}
            empty={copy.library.selectionEmpty}
            mod={detailMod}
            labels={{
              currentVersion: copy.fields.currentVersion,
              uniqueId: copy.fields.uniqueId,
              path: copy.fields.path,
              dependencies: copy.fields.dependencies,
              updateKeys: copy.fields.updateKeys,
              pack: copy.library.packLabel,
            }}
            noSummary={copy.states.noSummary}
            onToggleEnabled={() => {
              if (detailMod) {
                void library.toggleEnabled(detailMod)
              }
            }}
            enableLabel={copy.actions.enable}
            disableLabel={copy.actions.disable}
            enabledStateLabel={copy.overview.enabledMods}
            disabledStateLabel={copy.overview.disabledMods}
            openFolderLabel={copy.actions.openFolder}
            setCoverLabel={copy.actions.setCover}
            clearCoverLabel={copy.actions.clearCover}
            openModPageLabel={copy.actions.openModPage}
            onOpenFolder={() => {
              void openSelectedModFolder()
            }}
            onSetCover={() => {
              void setSelectedModCover()
            }}
            onClearCover={() => {
              void clearSelectedModCover()
            }}
            packName={detailMod ? resolvePackName(detailMod) : null}
          />
        </div>

        <button
          type="button"
          className="control-button control-button-primary launcher-library-launch-fab"
          disabled={launchGameDisabled}
          onClick={onLaunchGame}
        >
          <Play className="h-4 w-4" />
          <span>{launchGameBusy ? `${launchGameLabel}...` : launchGameLabel}</span>
        </button>
      </section>

      <LauncherArchiveInstallDialog
        open={archivePreviewState !== 'idle'}
        loading={archivePreviewState === 'loading'}
        installing={installingArchive}
        preview={archivePreview}
        error={archivePreviewState === 'error' ? archivePreviewError : null}
        onClose={closeArchivePreview}
        onConfirm={() => void confirmArchiveInstall()}
      />
    </>
  )
}
