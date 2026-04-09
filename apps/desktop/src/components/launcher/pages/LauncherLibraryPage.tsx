import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, FolderArchive, FolderOpen, Play, RefreshCw, Search, Settings2 } from 'lucide-react'
import { useEditorCopy } from '../../../lib/app/localeContext'
import {
  chooseArchiveFile,
  chooseImageFile,
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

function includesLibraryFilter(item: LauncherLibraryItem, filterText: string) {
  const normalizedFilter = filterText.trim().toLowerCase()
  if (!normalizedFilter) {
    return true
  }

  return [item.name, item.author, item.uniqueId, item.version]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(normalizedFilter))
}

function buildLibraryCardMeta(mod: LauncherLibraryItem, noneLabel: string) {
  const author = mod.author?.trim()
  const version = mod.version?.trim()
  if (author && version) {
    return `${author} · v${version}`
  }
  if (author) {
    return author
  }
  if (version) {
    return `v${version}`
  }
  return noneLabel
}

function getPackModIds(pack: LauncherPackPreset | null, mods: LauncherLibraryItem[]) {
  if (!pack) {
    return []
  }

  const wantedKeys = new Set(pack.modKeys.map((value) => normalizeLookupKey(value)))
  return mods.filter((item) => wantedKeys.has(normalizeLookupKey(getModKey(item)))).map((item) => item.id)
}

export function LauncherLibraryPage({
  settings,
  launchGameLabel,
  launchGameDisabled,
  launchGameBusy,
  onLaunchGame,
}: LauncherLibraryPageProps) {
  const editorCopy = useEditorCopy()
  const copy = editorCopy.launcher
  const library = useLauncherLibrary(settings)
  const { refresh } = library

  const [archivePreviewState, setArchivePreviewState] = useState<ArchivePreviewState>('idle')
  const [archivePreview, setArchivePreview] = useState<InspectLauncherArchiveResult | null>(null)
  const [archivePreviewError, setArchivePreviewError] = useState<string | null>(null)
  const [installingArchive, setInstallingArchive] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<LibrarySortMode>('name')
  const [detailModId, setDetailModId] = useState<string | null>(null)
  const [packMenuOpen, setPackMenuOpen] = useState(false)
  const [packSettingsOpen, setPackSettingsOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingSelectionIds, setEditingSelectionIds] = useState<string[]>([])

  const packMenuRef = useRef<HTMLDivElement | null>(null)
  const packSettingsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const packLookup = useMemo(() => buildPackLookup(library.packPresets), [library.packPresets])
  const detailMod = useMemo(
    () => (detailModId ? library.mods.find((item) => item.id === detailModId) ?? null : null),
    [detailModId, library.mods],
  )

  useEffect(() => {
    if (!detailModId || detailMod) {
      return
    }
    setDetailModId(null)
  }, [detailMod, detailModId])

  useEffect(() => {
    if (!editMode) {
      return
    }

    setEditingSelectionIds(getPackModIds(library.currentPack, library.mods))
  }, [editMode, library.currentPack, library.mods])

  useEffect(() => {
    if (!packMenuOpen && !packSettingsOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (packMenuRef.current?.contains(target) || packSettingsRef.current?.contains(target)) {
        return
      }
      setPackMenuOpen(false)
      setPackSettingsOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [packMenuOpen, packSettingsOpen])

  const visibleMods = useMemo(() => {
    const source = library.mods.filter((item) => includesLibraryFilter(item, library.filterText))
    const enabledFiltered = library.enabledOnly ? source.filter((item) => item.enabled) : source
    const browseScoped =
      editMode || !library.currentPack
        ? enabledFiltered
        : enabledFiltered.filter((item) =>
            library.currentPack?.modKeys.some((value) => normalizeLookupKey(value) === normalizeLookupKey(getModKey(item))),
          )

    return sortLibraryMods(browseScoped, sortMode, packLookup, library.currentPackId)
  }, [editMode, library.currentPack, library.currentPackId, library.enabledOnly, library.filterText, library.mods, packLookup, sortMode])

  const shortModsPath = useMemo(() => shortenLibraryPath(settings.modsPath), [settings.modsPath])

  const closeArchivePreview = () => {
    setArchivePreviewState('idle')
    setArchivePreview(null)
    setArchivePreviewError(null)
    setInstallingArchive(false)
  }

  const runLibraryAction = async (action: () => Promise<void>) => {
    setActionError(null)
    try {
      await action()
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : copy.library.empty)
    }
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

  const openLibraryRoot = () =>
    runLibraryAction(async () => {
      if (!settings.modsPath) {
        throw new Error(copy.states.missingModsPath)
      }
      await openLauncherPath({ path: settings.modsPath })
    })

  const openModFolder = (mod: LauncherLibraryItem) =>
    runLibraryAction(async () => {
      await openLauncherPath({ path: mod.absolutePath })
    })

  const setModCover = (mod: LauncherLibraryItem) =>
    runLibraryAction(async () => {
      const imagePath = await chooseImageFile(copy.actions.setCover)
      if (!imagePath) {
        return
      }
      await setLauncherLibraryCover({ labelKey: mod.labelKey, imagePath })
      await library.refresh()
    })

  const clearModCover = (mod: LauncherLibraryItem) =>
    runLibraryAction(async () => {
      await setLauncherLibraryCover({ labelKey: mod.labelKey, imagePath: null })
      await library.refresh()
    })

  const openModDetails = (modId: string) => {
    library.setSelectedModId(modId)
    setDetailModId(modId)
  }

  const toggleEditSelection = (modId: string) => {
    setEditingSelectionIds((current) => (current.includes(modId) ? current.filter((item) => item !== modId) : [...current, modId]))
  }

  const startEditMode = () => {
    if (!library.currentPack) {
      return
    }
    setEditingSelectionIds(getPackModIds(library.currentPack, library.mods))
    setEditMode(true)
    setPackMenuOpen(false)
    setPackSettingsOpen(false)
  }

  const cancelEditMode = () => {
    setEditingSelectionIds([])
    setEditMode(false)
  }

  const saveEditMode = () =>
    runLibraryAction(async () => {
      if (!library.currentPack) {
        return
      }
      await library.replacePackMods(library.currentPack.id, editingSelectionIds)
      setEditMode(false)
    })

  const renameCurrentPack = async () => {
    if (!library.currentPack) {
      return
    }

    const nextName = window.prompt(copy.library.renameCurrentPackPrompt(library.currentPack.name), library.currentPack.name)
    if (!nextName?.trim()) {
      return
    }

    await runLibraryAction(async () => {
      await library.renamePackPreset(library.currentPack!.id, nextName.trim())
    })
    setPackSettingsOpen(false)
  }

  const createPack = async () => {
    const nextName = window.prompt(copy.actions.createPack)
    if (!nextName?.trim()) {
      return
    }

    await runLibraryAction(async () => {
      await library.createPackPreset(nextName.trim())
    })
    setPackSettingsOpen(false)
  }

  const deleteCurrentPack = async () => {
    if (!library.currentPack) {
      return
    }

    const confirmed = window.confirm(copy.library.deleteCurrentPackConfirm(library.currentPack.name))
    if (!confirmed) {
      return
    }

    await runLibraryAction(async () => {
      await library.deletePackPreset(library.currentPack!.id)
    })
    setPackSettingsOpen(false)
    setEditMode(false)
  }

  const directActionsForMod = (mod: LauncherLibraryItem) => [
    { label: copy.actions.viewDetails, onSelect: () => openModDetails(mod.id) },
    { label: copy.actions.openFolder, onSelect: () => void openModFolder(mod) },
    { label: mod.enabled ? copy.actions.disable : copy.actions.enable, onSelect: () => void library.toggleEnabled(mod) },
    { label: copy.actions.setCover, onSelect: () => void setModCover(mod) },
    { label: copy.actions.clearCover, onSelect: () => void clearModCover(mod) },
  ]

  const editCount = editingSelectionIds.length
  const currentPackLabel = library.currentPack ? `${library.currentPack.name} (${library.currentPack.modKeys.length})` : copy.library.allPacks

  return (
    <>
      <section className="launcher-library-page">
        <div className="launcher-library-canvas">
          {!editMode ? (
            <section className="launcher-library-console">
              <div className="launcher-library-console-top">
                <div className="launcher-library-console-copy">
                  <h1 className="launcher-library-console-title">{copy.library.title}</h1>
                  {shortModsPath ? (
                    <p className="launcher-library-console-subtitle" title={settings.modsPath ?? undefined}>
                      {shortModsPath}
                    </p>
                  ) : null}
                </div>

                <div className="launcher-library-console-actions">
                  <button type="button" className="launcher-library-icon-button" onClick={() => void library.refresh()} aria-label={copy.actions.refresh} title={copy.actions.refresh}>
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button type="button" className="launcher-library-icon-button" onClick={() => void openLibraryRoot()} aria-label={copy.actions.openStorageFolder} title={copy.actions.openStorageFolder}>
                    <FolderOpen className="h-4 w-4" />
                  </button>
                  <button type="button" className="control-button launcher-library-secondary-action" onClick={() => void inspectArchive()}>
                    <FolderArchive className="h-4 w-4" />
                    <span>{copy.actions.installArchive}</span>
                  </button>
                  <button type="button" className="control-button control-button-primary launcher-library-primary-action" disabled={launchGameDisabled} onClick={onLaunchGame}>
                    <Play className="h-4 w-4" />
                    <span>{launchGameBusy ? `${launchGameLabel}...` : launchGameLabel}</span>
                  </button>
                </div>
              </div>

              <div className="launcher-library-console-divider" />

              <div className="launcher-library-console-bottom">
                <div className="launcher-library-console-left">
                  <label className="launcher-library-search">
                    <Search className="h-4 w-4" />
                    <input value={library.filterText} onChange={(event) => library.setFilterText(event.target.value)} placeholder={copy.fields.filterLibrary} spellCheck={false} />
                  </label>

                  <div className="launcher-library-popover-shell" ref={packMenuRef}>
                    <button
                      type="button"
                      className="launcher-library-pack-trigger"
                      aria-label={`${copy.library.packButtonLabel} ${library.currentPack?.name ?? copy.library.allPacks}`}
                      onClick={() => {
                        setPackMenuOpen((current) => !current)
                        setPackSettingsOpen(false)
                      }}
                    >
                      <span>{currentPackLabel}</span>
                      <ChevronDown className="h-4 w-4" />
                    </button>

                    {packMenuOpen ? (
                      <div className="launcher-library-pack-menu">
                        <button
                          type="button"
                          className={cx('launcher-library-pack-option', !library.currentPackId && 'launcher-library-pack-option-active')}
                          onClick={() => {
                            void library.setCurrentPackId(null)
                            setPackMenuOpen(false)
                          }}
                        >
                          <span>{copy.library.allPacks}</span>
                        </button>

                        {library.packPresets.map((pack) => (
                          <button
                            key={pack.id}
                            type="button"
                            className={cx(
                              'launcher-library-pack-option',
                              normalizeLookupKey(pack.id) === normalizeLookupKey(library.currentPackId ?? '') && 'launcher-library-pack-option-active',
                            )}
                            aria-label={`${copy.library.packButtonLabel} ${pack.name}`}
                            onClick={() => {
                              void library.setCurrentPackId(pack.id)
                              setPackMenuOpen(false)
                            }}
                          >
                            <span>{pack.name}</span>
                            <span>{pack.modKeys.length}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="launcher-library-popover-shell" ref={packSettingsRef}>
                    <button
                      type="button"
                      className="launcher-library-icon-button"
                      aria-label={copy.library.manageCurrentPack}
                      title={copy.library.manageCurrentPack}
                      onClick={() => {
                        setPackSettingsOpen((current) => !current)
                        setPackMenuOpen(false)
                      }}
                    >
                      <Settings2 className="h-4 w-4" />
                    </button>

                    {packSettingsOpen ? (
                      <div className="launcher-library-settings-menu">
                        <button type="button" className="launcher-library-settings-option" onClick={() => void createPack()}>
                          {copy.actions.createPack}
                        </button>
                        <button type="button" className="launcher-library-settings-option" onClick={() => void startEditMode()}>
                          {copy.library.editCurrentPack}
                        </button>
                        <button type="button" className="launcher-library-settings-option" onClick={() => void renameCurrentPack()}>
                          {copy.library.renameCurrentPack}
                        </button>
                        <button type="button" className="launcher-library-settings-option" onClick={() => void deleteCurrentPack()}>
                          {copy.library.deleteCurrentPack}
                        </button>
                      </div>
                    ) : null}
                  </div>

                </div>

                <div className="launcher-library-console-right">
                  <button
                    type="button"
                    className={cx('launcher-library-switch-button', library.enabledOnly && 'launcher-library-switch-button-active')}
                    aria-pressed={library.enabledOnly}
                    onClick={() => library.setEnabledOnly(!library.enabledOnly)}
                  >
                    <span className="launcher-library-switch-track" aria-hidden="true" />
                    <span>{copy.toggles.enabledOnly}</span>
                  </button>

                  <label className="launcher-library-sort-field">
                    <span className="sr-only">{copy.library.sortLabel}</span>
                    <select aria-label={copy.library.sortLabel} value={sortMode} onChange={(event) => setSortMode(event.target.value as LibrarySortMode)}>
                      <option value="name">{copy.library.sortByName}</option>
                      <option value="enabled-first">{copy.library.sortByEnabled}</option>
                      <option value="pack">{copy.library.sortByPack}</option>
                    </select>
                    <ChevronDown className="h-4 w-4" />
                  </label>
                </div>
              </div>
            </section>
          ) : (
            <section className="launcher-library-edit-bar">
              <div className="launcher-library-edit-bar-left">
                <span className="launcher-library-edit-label">
                  {copy.library.editingPackLabel} <strong>{library.currentPack?.name ?? copy.library.allPacks}</strong>
                </span>
              </div>
              <div className="launcher-library-edit-bar-center">
                <span className="launcher-library-edit-label">{copy.library.includedModsCount(editCount)}</span>
              </div>
              <div className="launcher-library-edit-bar-right">
                <button type="button" className="control-button launcher-library-secondary-action" onClick={cancelEditMode}>
                  {copy.library.cancelEdit}
                </button>
                <button type="button" className="control-button control-button-primary launcher-library-primary-action" onClick={() => void saveEditMode()}>
                  {copy.library.saveChanges}
                </button>
              </div>
            </section>
          )}

          <div className="launcher-library-browser">
            {actionError ? <LauncherStateBlock title={copy.library.title} detail={actionError} tone="warning" /> : null}
            {library.state === 'error' ? <LauncherStateBlock title={copy.library.title} detail={library.error ?? copy.library.empty} tone="warning" /> : null}
            {library.state !== 'error' && !visibleMods.length ? (
              <LauncherStateBlock title={settings.modsPath ? copy.library.filteredEmpty : copy.states.missingModsPath} detail={copy.library.subtitle} />
            ) : (
              <div className={cx('launcher-library-grid', editMode && 'launcher-library-grid-editing')}>
                {visibleMods.map((item) => (
                  <LauncherModCard
                    key={item.id}
                    title={item.name}
                    titleTooltip={item.name}
                    meta={buildLibraryCardMeta(item, editorCopy.common.none)}
                    imageUrl={item.imageUrl}
                    enabled={item.enabled}
                    selectionMode={editMode}
                    selected={editingSelectionIds.includes(item.id)}
                    onSelect={() => {
                      if (editMode) {
                        toggleEditSelection(item.id)
                        return
                      }
                      library.setSelectedModId(item.id)
                    }}
                    contextActions={editMode ? undefined : directActionsForMod(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <LauncherModDetailPanel
          open={Boolean(detailMod)}
          onClose={() => setDetailModId(null)}
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
            if (detailMod) {
              void openModFolder(detailMod)
            }
          }}
          onSetCover={() => {
            if (detailMod) {
              void setModCover(detailMod)
            }
          }}
          onClearCover={() => {
            if (detailMod) {
              void clearModCover(detailMod)
            }
          }}
          packName={
            detailMod
              ? packLookup.get(normalizeLookupKey(getModKey(detailMod)))?.find(
                  (pack) => normalizeLookupKey(pack.id) === normalizeLookupKey(library.currentPackId ?? ''),
                )?.name ?? null
              : null
          }
        />
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
