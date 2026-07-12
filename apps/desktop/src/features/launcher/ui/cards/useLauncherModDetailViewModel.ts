import type { CSSProperties } from 'react'
import type { useEditorCopy } from '@locales/provider'
import type { LauncherDiscoverDetail, LauncherLibraryItem } from '../../model/types'
import { buildLauncherDependencyTree, type LauncherDependencyTreeModel } from './dependency-tree/dependencyTreeBuilder'
import type { DependencyTreeCopy, LauncherDetailMod, RemoteDependencyLoadState } from './dependency-tree/dependencyTreeTypes'
import { getLauncherCardCoverWord, getLauncherCardFallbackPalette } from './launcherCardPresentation'
import {
  buildChangelogItems,
  compactNumber,
  formatDate,
  formatSize,
  hasUpdate,
  normalizeVersion,
  resolveFileGroup,
  truncatePath,
  type ChangelogListItem,
  type DetailRow,
  type FileListItem,
  type LauncherDetailTab,
} from './launcherModDetailData'

type EditorCopy = ReturnType<typeof useEditorCopy>

export type LauncherModDetailViewModelInput = {
  copy: EditorCopy
  activeTab: LauncherDetailTab
  mod: LauncherDetailMod | null
  remote: LauncherDiscoverDetail | null | undefined
  packName?: string | null
  libraryMods: LauncherLibraryItem[]
  remoteDependencyDetails: Record<number, RemoteDependencyLoadState>
  remoteFilesDeferred: boolean
  deferredFilesModId: number | null
  canQueueDownload: boolean
}

export type LauncherModDetailViewModel = {
  statusFlags: {
    isLocal: boolean
    isNexus: boolean
    isCombined: boolean
    updateAvailable: boolean
  }
  hero: {
    displayName: string
    displayAuthor: string
    displayVersion: string
    category: string | null
    subtitleText: string
    overviewDescription: string
    fullDescription: string
    latestVersion: string | null
    dependencyText: string
    primarySize: string
    coverStyle: CSSProperties
    coverWord: string
    imageUrl: string | null
    localRows: DetailRow[]
    remoteRows: DetailRow[]
  }
  tabs: {
    items: LauncherDetailTab[]
    selected: LauncherDetailTab
    hasChangelogData: boolean
    hasDependencyData: boolean
    hasFileData: boolean
    missingDependencyCount: number
    missingDependencyLabel: string | null
  }
  details: {
    localRows: DetailRow[]
    manifestRows: DetailRow[]
    nexusPageRows: DetailRow[]
    primaryFileRows: DetailRow[]
    updateEvidenceRows: DetailRow[]
  }
  files: {
    remoteFiles: NonNullable<LauncherDiscoverDetail['files']>
    items: FileListItem[]
  }
  changelog: {
    items: ChangelogListItem[]
  }
  dependencyTree: LauncherDependencyTreeModel
  remote: {
    fallbackModId: number | null
    primaryFileId: string
  }
}

function buildDependencyTreeCopy(copy: EditorCopy): DependencyTreeCopy {
  const detailCopy = copy.launcher.library.modDetail
  return {
    localRequirement: detailCopy.localRequirement,
    remoteRequirement: detailCopy.remoteRequirement,
    externalRequirement: detailCopy.externalRequirement,
    modLoaderRequirement: detailCopy.modLoaderRequirement,
    missing: detailCopy.missing,
    satisfied: detailCopy.satisfied,
    optional: detailCopy.optionalDependency,
    disabled: detailCopy.disabledDependency,
    dependencyIssue: detailCopy.dependencyIssue,
    loading: detailCopy.dependencyLoading,
    loadError: detailCopy.dependencyLoadError,
    cycle: detailCopy.dependencyCycle,
  }
}

function buildDetailTabs({
  hasChangelogData,
  hasDependencyData,
  hasFileData,
  hasConfigData,
  activeTab,
}: {
  hasChangelogData: boolean
  hasDependencyData: boolean
  hasFileData: boolean
  hasConfigData: boolean
  activeTab: LauncherDetailTab
}) {
  const items: LauncherDetailTab[] = ['description']
  if (hasChangelogData) {
    items.push('changelog')
  }
  items.push('details')
  if (hasDependencyData) {
    items.push('dependencies')
  }
  if (hasFileData) {
    items.push('files')
  }
  if (hasConfigData) {
    items.push('config')
  }
  return {
    items,
    selected: items.includes(activeTab) ? activeTab : 'description',
  }
}

/** Builds the pure render model for LauncherModDetailPanel without owning effects, events, or host calls. */
export function useLauncherModDetailViewModel({
  copy,
  activeTab,
  mod,
  remote,
  packName,
  libraryMods,
  remoteDependencyDetails,
  remoteFilesDeferred,
  deferredFilesModId,
  canQueueDownload,
}: LauncherModDetailViewModelInput): LauncherModDetailViewModel {
  const launcherCopy = copy.launcher
  const detailCopy = launcherCopy.library.modDetail
  const fallbackRemoteModId = mod?.nexusModId ?? null
  const isLocal = Boolean(mod?.absolutePath)
  const isNexus = Boolean(remote)
  const isCombined = isLocal && isNexus
  const latestVersion = remote?.primaryFileVersion ?? remote?.version ?? null
  const updateAvailable = isCombined && hasUpdate(mod?.version, latestVersion)
  const displayName = mod?.name ?? remote?.title ?? launcherCopy.library.detailsTitle
  const displayAuthor = mod?.author ?? remote?.author ?? launcherCopy.library.detailsSubtitle
  const displayVersion = isCombined
    ? `${detailCopy.installedVersionShort} ${normalizeVersion(mod?.version, copy.common.none)} · ${detailCopy.nexusVersionShort} ${normalizeVersion(latestVersion, copy.common.none)}`
    : normalizeVersion(mod?.version ?? latestVersion, copy.common.none)
  const category = remote?.category ?? packName ?? null
  const subtitleText = [displayAuthor ? `${detailCopy.byAuthor} ${displayAuthor}` : null, displayVersion, category]
    .filter(Boolean)
    .join(' · ')
  const overviewDescription = remote?.summary ?? mod?.description ?? launcherCopy.states.noSummary
  const fullDescription = remote?.description ?? remote?.summary ?? mod?.description ?? launcherCopy.states.noSummary
  const fallbackPalette = getLauncherCardFallbackPalette(displayName)
  const coverStyle = {
    '--launcher-cover-bright': fallbackPalette.bright,
    '--launcher-cover-base': fallbackPalette.base,
    '--launcher-cover-dark': fallbackPalette.dark,
    '--launcher-cover-edge': fallbackPalette.edge,
    '--launcher-cover-glow': fallbackPalette.glow,
    '--launcher-cover-shadow': fallbackPalette.shadow,
  } as CSSProperties
  const dependencyText = mod?.missingRequiredDependencies?.length ? mod.missingRequiredDependencies.join(', ') : detailCopy.clean
  const primaryFileName = remote?.primaryFileName ?? (remote ? remote.title : null)
  const primaryFileId = remote?.primaryFileId ? `#${remote.primaryFileId}` : copy.common.none
  const primarySize = formatSize(remote?.primaryFileSize ?? remote?.fileSize, remote?.primaryFileSizeBytes, copy.common.none)
  const dependencyCopy = buildDependencyTreeCopy(copy)
  const previewDependencyTree = buildLauncherDependencyTree({
    mod,
    remote,
    libraryMods,
    remoteDependencyDetails: {},
    copy: dependencyCopy,
    rootImageUrl: remote?.imageUrl ?? mod?.imageUrl ?? null,
  })
  const dependencyTree = buildLauncherDependencyTree({
    mod,
    remote,
    libraryMods,
    remoteDependencyDetails,
    copy: dependencyCopy,
    rootImageUrl: remote?.imageUrl ?? mod?.imageUrl ?? null,
  })
  const remoteFiles = (remote?.files ?? []).filter((file) => (file.name ?? '').trim() !== '' || file.fileId)
  const changelogItems = buildChangelogItems({
    primaryLines: remote?.primaryFileChangelog,
    primarySource: primaryFileName ?? detailCopy.primaryFile,
    primaryVersion: latestVersion,
    files: remoteFiles,
    noneLabel: copy.common.none,
  })
  const hasDependencyData = previewDependencyTree.items.length > 0
  const hasDeferredFileData = Boolean(remoteFilesDeferred && deferredFilesModId && canQueueDownload)
  const hasFileData = isNexus && (remoteFiles.length > 0 || hasDeferredFileData)
  const hasConfigData = isLocal && Boolean(mod?.hasConfig)
  const hasChangelogData = isNexus && (changelogItems.length > 0 || Boolean(remoteFilesDeferred && deferredFilesModId))
  const detailTabs = buildDetailTabs({
    hasChangelogData,
    hasDependencyData,
    hasFileData,
    hasConfigData,
    activeTab,
  })
  const missingDependencyCount = dependencyTree.issueCount
  const missingDependencyLabel = missingDependencyCount ? launcherCopy.library.missingDependenciesCount(missingDependencyCount) : null
  const localHeroRows: DetailRow[] = isLocal
    ? [
        { label: detailCopy.installPath, value: truncatePath(mod?.absolutePath, copy.common.none), title: mod?.absolutePath ?? undefined },
        { label: detailCopy.folder, value: mod?.folderName ?? copy.common.none, title: mod?.folderName ?? undefined },
        { label: launcherCopy.fields.dependencies, value: dependencyText, title: dependencyText },
      ]
    : []
  const remoteHeroRows: DetailRow[] = isNexus
    ? [
        { label: detailCopy.updated, value: formatDate(remote?.updatedAt, copy.common.none), title: remote?.updatedAt ?? undefined },
        { label: detailCopy.download, value: compactNumber(remote?.downloads, copy.common.none) },
        { label: launcherCopy.sortOptions.endorsements, value: compactNumber(remote?.endorsements, copy.common.none) },
      ]
    : []
  const localDetails: DetailRow[] = [
    { label: detailCopy.absolutePath, value: truncatePath(mod?.absolutePath, copy.common.none), title: mod?.absolutePath ?? undefined },
    { label: detailCopy.manifestFile, value: 'manifest.json' },
  ]
  const manifestDetails: DetailRow[] = [
    { label: launcherCopy.fields.updateKeys, value: mod?.updateKeys?.[0] ?? '', title: mod?.updateKeys?.join(', ') },
    { label: launcherCopy.library.packLabel, value: packName ?? '', title: packName ?? undefined },
  ]
  const nexusPageDetails: DetailRow[] = [
    { label: detailCopy.requirement, value: remote?.requiredLoader ?? '', title: remote?.requiredLoader ?? undefined },
    { label: detailCopy.gameVersion, value: remote?.gameVersion ?? '', title: remote?.gameVersion ?? undefined },
    {
      label: detailCopy.download,
      value: remote?.directDownloadEnabled ? detailCopy.directDownload : remote?.supportsVortex ? detailCopy.vortexSupported : '',
    },
  ]
  const primaryFileDetails: DetailRow[] = [
    { label: detailCopy.name, value: primaryFileName ?? '', title: primaryFileName ?? undefined },
    { label: detailCopy.fileId, value: remote?.primaryFileId ? primaryFileId : '' },
    { label: detailCopy.archiveType, value: remote?.archiveType ?? '', title: remote?.archiveType ?? undefined },
  ]
  const evidenceText = fallbackRemoteModId ? `Nexus:${fallbackRemoteModId}` : copy.common.none
  const evidenceTitle = fallbackRemoteModId ? `${detailCopy.updateKeyEvidence} ${evidenceText}` : undefined
  const updateEvidenceDetails: DetailRow[] = [
    { label: detailCopy.method, value: fallbackRemoteModId ? detailCopy.updateKey : copy.common.none },
    { label: detailCopy.evidence, value: evidenceText, title: evidenceTitle },
    { label: detailCopy.confidence, value: fallbackRemoteModId ? detailCopy.exact : copy.common.none },
    { label: detailCopy.primaryFile, value: primaryFileId },
    { label: detailCopy.sizeChange, value: copy.common.none },
    {
      label: detailCopy.risk,
      value: remote?.updateRisk ?? copy.common.none,
    },
    { label: detailCopy.match, value: fallbackRemoteModId ? detailCopy.exactUpdateKeyMatch : copy.common.none },
  ]
  const fileItems: FileListItem[] = remoteFiles.map((file) => {
    const fileName = file.name ?? (file.fileId ? `#${file.fileId}` : '')
    const meta = [
      file.version ? normalizeVersion(file.version, copy.common.none) : null,
      file.category ?? null,
      file.uploadedAt ? formatDate(file.uploadedAt, copy.common.none) : null,
      formatSize(file.size, file.sizeBytes, copy.common.none),
      file.uniqueDownloads ? detailCopy.uniqueDownloads(compactNumber(file.uniqueDownloads, copy.common.none)) : null,
      file.totalDownloads ? detailCopy.totalDownloads(compactNumber(file.totalDownloads, copy.common.none)) : null,
    ]
      .filter(Boolean)
      .join(' · ')
    const description = file.description?.trim() ?? ''
    return {
      id: `${file.fileId ?? fileName}`,
      name: fileName,
      meta: [meta, file.archiveType, file.managerDownloadEnabled ? detailCopy.modManagerDownload : null].filter(Boolean).join(' · '),
      status: '',
      description,
      fileId: file.fileId ?? null,
      version: file.version ?? null,
      primary: Boolean(file.primary),
      group: resolveFileGroup(file),
    }
  })

  return {
    statusFlags: {
      isLocal,
      isNexus,
      isCombined,
      updateAvailable,
    },
    hero: {
      displayName,
      displayAuthor,
      displayVersion,
      category,
      subtitleText,
      overviewDescription,
      fullDescription,
      latestVersion,
      dependencyText,
      primarySize,
      coverStyle,
      coverWord: getLauncherCardCoverWord(displayName),
      imageUrl: mod?.imageUrl ?? remote?.imageUrl ?? null,
      localRows: localHeroRows,
      remoteRows: remoteHeroRows,
    },
    tabs: {
      items: detailTabs.items,
      selected: detailTabs.selected,
      hasChangelogData,
      hasDependencyData,
      hasFileData,
      missingDependencyCount,
      missingDependencyLabel,
    },
    details: {
      localRows: localDetails,
      manifestRows: manifestDetails,
      nexusPageRows: nexusPageDetails,
      primaryFileRows: primaryFileDetails,
      updateEvidenceRows: updateEvidenceDetails,
    },
    files: {
      remoteFiles,
      items: fileItems,
    },
    changelog: {
      items: changelogItems,
    },
    dependencyTree,
    remote: {
      fallbackModId: fallbackRemoteModId,
      primaryFileId,
    },
  }
}
