import type { CSSProperties } from 'react'
import { ExternalLink, FolderOpen, ImageIcon, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useEditorCopy } from '@locales/provider'
import { useLauncherPort } from '@features/launcher/model/launcherPortContext'
import { useLauncherRemoteModDetail } from '@features/launcher/model/useLauncherRemoteModDetail'
import { cx } from '@shared/lib/helper'
import { NexusModsBbcode } from '@shared/ui/nexusmods-bbcode'
import { PanelEmptyState } from '@shared/ui/PanelSection'
import type { LauncherDiscoverDetail, LauncherLibraryItem, QueueLauncherDownloadInput } from '../../model/types'
import { LauncherArtworkCover } from './LauncherArtworkCover'
import { getLauncherCardCoverWord, getLauncherCardFallbackPalette } from './launcherCardPresentation'
import { ChangelogList, DependencyTree, DetailDataLoading, DetailSection, FileList, PropertyRow } from './LauncherModDetailLists'
import {
  buildChangelogItems,
  compactNumber,
  formatDate,
  formatSize,
  hasUpdate,
  normalizeVersion,
  resolveFileGroup,
  truncatePath,
  type DependencyTreeNode,
  type DependencyTreeNodeStatus,
  type DetailRow,
  type FileListItem,
} from './launcherModDetailData'

type LauncherDetailTab = 'description' | 'changelog' | 'details' | 'dependencies' | 'files'

type LauncherDetailMod = Partial<LauncherLibraryItem> & {
  packName?: string | null
}

type RemoteDependencyLoadState = {
  state: 'loading' | 'ready' | 'error'
  detail?: LauncherDiscoverDetail
  error?: string
}

type DependencyCopy = {
  localRequirement: string
  remoteRequirement: string
  externalRequirement: string
  missing: string
  satisfied: string
  disabled: string
  dependencyIssue: string
  loading: string
  loadError: string
  cycle: string
}

function shouldDeferDetailContent() {
  return import.meta.env.MODE !== 'test' && (typeof navigator === 'undefined' || !navigator.userAgent.toLowerCase().includes('jsdom'))
}

function normalizeDependencyMatchKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, '')
}

type LocalDependencyLookup = {
  identity: Map<string, LauncherLibraryItem | LauncherDetailMod>
  display: Map<string, LauncherLibraryItem | LauncherDetailMod>
}

function findExactDependencyMatchKey(keys: string[], requirementName: string) {
  const requirementKey = normalizeDependencyMatchKey(requirementName)
  return keys.find((key) => normalizeDependencyMatchKey(key) === requirementKey)
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function mergeDependencyNames(values: string[]) {
  const keys: string[] = []
  const names: string[] = []
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      const matchedKey = findExactDependencyMatchKey(keys, value)
      if (matchedKey) {
        return
      }
      keys.push(normalizeDependencyMatchKey(value))
      names.push(value)
    })
  return names
}

function getLocalDependencyIdentityKeys(mod: LauncherDetailMod | LauncherLibraryItem) {
  return [mod.uniqueId, mod.labelKey].filter((value): value is string => Boolean(value?.trim()))
}

function getLocalDependencyDisplayKeys(mod: LauncherDetailMod | LauncherLibraryItem) {
  return [mod.folderName, mod.name].filter((value): value is string => Boolean(value?.trim()))
}

function buildLocalDependencyLookup(libraryMods: LauncherLibraryItem[], rootMod: LauncherDetailMod | null) {
  const lookup: LocalDependencyLookup = {
    identity: new Map(),
    display: new Map(),
  }
  const addMod = (item: LauncherLibraryItem | LauncherDetailMod | null) => {
    if (!item) {
      return
    }
    getLocalDependencyIdentityKeys(item).forEach((key) => {
      lookup.identity.set(normalizeDependencyMatchKey(key), item)
    })
    getLocalDependencyDisplayKeys(item).forEach((key) => {
      lookup.display.set(normalizeDependencyMatchKey(key), item)
    })
  }

  libraryMods.forEach(addMod)
  addMod(rootMod)
  return lookup
}

function findLocalDependency(lookup: LocalDependencyLookup, name: string) {
  const key = normalizeDependencyMatchKey(name)
  return lookup.identity.get(key) ?? lookup.display.get(key) ?? null
}

function buildRemoteRequirementLookup(requirements: LauncherDiscoverDetail['requirements']) {
  const lookup = new Map<string, NonNullable<LauncherDiscoverDetail['requirements']>[number]>()
  ;(requirements ?? []).forEach((requirement) => {
    if (requirement.name.trim()) {
      lookup.set(normalizeDependencyMatchKey(requirement.name), requirement)
    }
  })
  return lookup
}

function findRemoteRequirement(lookup: Map<string, NonNullable<LauncherDiscoverDetail['requirements']>[number]>, name: string) {
  const direct = lookup.get(normalizeDependencyMatchKey(name))
  if (direct) {
    return direct
  }
  const matchedKey = findExactDependencyMatchKey(Array.from(lookup.keys()), name)
  return matchedKey ? (lookup.get(matchedKey) ?? null) : null
}

function getMissingDependencySet(mod: LauncherDetailMod | LauncherLibraryItem | null | undefined) {
  return new Set((mod?.missingRequiredDependencies ?? []).map((item) => item.trim()).filter(Boolean))
}

function resolveDependencyStatusKind({
  cycle = false,
  remoteState,
  external = false,
  missing = false,
  disabled = false,
  transitive = false,
}: {
  cycle?: boolean
  remoteState?: RemoteDependencyLoadState['state']
  external?: boolean
  missing?: boolean
  disabled?: boolean
  transitive?: boolean
}): DependencyTreeNodeStatus {
  if (cycle) return 'cycle'
  if (remoteState === 'loading') return 'loading'
  if (remoteState === 'error') return 'error'
  if (external) return 'external'
  if (missing) return 'missing'
  if (disabled) return 'disabled'
  if (transitive) return 'transitive'
  return 'satisfied'
}

function dependencyStatusLabel(statusKind: DependencyTreeNodeStatus, copy: DependencyCopy) {
  const labels: Record<DependencyTreeNodeStatus, string> = {
    satisfied: copy.satisfied,
    missing: copy.missing,
    disabled: copy.disabled,
    transitive: copy.dependencyIssue,
    external: copy.externalRequirement,
    loading: copy.loading,
    error: copy.loadError,
    cycle: copy.cycle,
  }
  return labels[statusKind]
}

function buildLocalDependencyNode({
  dependencyName,
  ownerId,
  localLookup,
  rootRemoteRequirementLookup,
  remoteDependencyDetails,
  copy,
  rootImageUrl,
  path,
}: {
  dependencyName: string
  ownerId: string
  localLookup: LocalDependencyLookup
  rootRemoteRequirementLookup: Map<string, NonNullable<LauncherDiscoverDetail['requirements']>[number]>
  remoteDependencyDetails: Record<number, RemoteDependencyLoadState>
  copy: DependencyCopy
  rootImageUrl: string | null | undefined
  path: Set<string>
}): DependencyTreeNode {
  const localMatch = findLocalDependency(localLookup, dependencyName)
  const remoteRequirement = findRemoteRequirement(rootRemoteRequirementLookup, dependencyName)
  const dependencyKey = normalizeDependencyMatchKey(localMatch?.uniqueId ?? dependencyName)
  const remoteModId = remoteRequirement?.external ? null : (remoteRequirement?.modId ?? localMatch?.nexusModId ?? null)
  const nodeId = `${ownerId}:${dependencyKey}:${remoteModId ?? 'local'}`
  const title = [localMatch?.name ?? dependencyName, localMatch?.uniqueId, remoteRequirement?.notes, remoteRequirement?.url]
    .filter(Boolean)
    .join(' · ')

  if (path.has(dependencyKey)) {
    return {
      id: `${nodeId}:cycle`,
      name: localMatch?.name ?? dependencyName,
      meta: copy.localRequirement,
      status: copy.cycle,
      statusKind: 'cycle',
      title,
      children: [],
      modId: remoteModId,
      url: remoteRequirement?.url ?? localMatch?.modUrl ?? null,
      imageUrl: localMatch?.imageUrl ?? rootImageUrl ?? null,
      version: localMatch?.version ?? null,
    }
  }

  const localMissingSet = getMissingDependencySet(localMatch)
  const localChildren = uniqueNonEmpty(localMatch?.requiredDependencies ?? [])
  const nextPath = new Set(path)
  nextPath.add(dependencyKey)
  const children = localChildren.map((childDependency) =>
    buildLocalDependencyNode({
      dependencyName: childDependency,
      ownerId: nodeId,
      localLookup,
      rootRemoteRequirementLookup,
      remoteDependencyDetails,
      copy,
      rootImageUrl,
      path: nextPath,
    }),
  )

  const externalOnly = !localMatch && Boolean(remoteRequirement?.external)
  const missing = !localMatch && !externalOnly
  const disabled = Boolean(localMatch && localMatch.enabled === false)
  const transitive = Boolean(localMatch && localMissingSet.size > 0)
  const remoteLoad = remoteModId ? remoteDependencyDetails[remoteModId] : undefined
  const remoteChildren =
    !localMatch && remoteLoad?.state === 'ready'
      ? uniqueNonEmpty(remoteLoad.detail?.requirements?.map((requirement) => requirement.name) ?? []).map((childDependency) =>
          buildRemoteDependencyNode({
            requirementName: childDependency,
            ownerId: nodeId,
            localLookup,
            remoteRequirementLookup: buildRemoteRequirementLookup(remoteLoad.detail?.requirements),
            remoteDependencyDetails,
            copy,
            rootImageUrl: remoteLoad.detail?.imageUrl ?? rootImageUrl,
            path: nextPath,
          }),
        )
      : []
  const statusKind = externalOnly ? 'external' : missing ? 'missing' : disabled ? 'disabled' : transitive ? 'transitive' : 'satisfied'
  const status = externalOnly
    ? copy.externalRequirement
    : missing
      ? copy.missing
      : disabled
        ? copy.disabled
        : transitive
          ? copy.dependencyIssue
          : copy.satisfied
  const meta = [
    localMatch ? copy.localRequirement : null,
    remoteRequirement ? (remoteRequirement.external ? copy.externalRequirement : copy.remoteRequirement) : null,
    localMatch?.version ? normalizeVersion(localMatch.version, '') : null,
    remoteRequirement?.notes,
    remoteLoad?.state === 'loading' ? copy.loading : null,
    remoteLoad?.state === 'error' ? copy.loadError : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    id: nodeId,
    name: localMatch?.name ?? dependencyName,
    meta,
    status: remoteLoad?.state === 'loading' ? copy.loading : remoteLoad?.state === 'error' ? copy.loadError : status,
    statusKind: remoteLoad?.state === 'loading' ? 'loading' : remoteLoad?.state === 'error' ? 'error' : statusKind,
    title,
    children: [...children, ...remoteChildren],
    downloadable: missing && Boolean(remoteModId),
    loadable: missing && Boolean(remoteModId) && remoteLoad?.state !== 'ready',
    loading: remoteLoad?.state === 'loading',
    modId: remoteModId,
    url: remoteRequirement?.url ?? localMatch?.modUrl ?? null,
    imageUrl: localMatch?.imageUrl ?? rootImageUrl ?? null,
    version: localMatch?.version ?? null,
  }
}

function buildRemoteDependencyNode({
  requirementName,
  ownerId,
  localLookup,
  remoteRequirementLookup,
  remoteDependencyDetails,
  copy,
  rootImageUrl,
  path,
}: {
  requirementName: string
  ownerId: string
  localLookup: LocalDependencyLookup
  remoteRequirementLookup: Map<string, NonNullable<LauncherDiscoverDetail['requirements']>[number]>
  remoteDependencyDetails: Record<number, RemoteDependencyLoadState>
  copy: DependencyCopy
  rootImageUrl: string | null | undefined
  path: Set<string>
}): DependencyTreeNode {
  const requirement = findRemoteRequirement(remoteRequirementLookup, requirementName)
  const localMatch = findLocalDependency(localLookup, requirementName)
  const modId = requirement?.external ? null : (requirement?.modId ?? null)
  const key = normalizeDependencyMatchKey(localMatch?.uniqueId ?? requirementName)
  const nodeId = `${ownerId}:remote:${key}:${modId ?? 'external'}`
  const remoteLoad = modId ? remoteDependencyDetails[modId] : undefined
  const cycle = path.has(key)
  const nextPath = new Set(path)
  nextPath.add(key)
  const localMissingSet = getMissingDependencySet(localMatch)
  const localChildren = uniqueNonEmpty(localMatch?.requiredDependencies ?? [])
  const localDependencyChildren =
    !cycle && localChildren.length
      ? localChildren.map((childDependency) =>
          buildLocalDependencyNode({
            dependencyName: childDependency,
            ownerId: nodeId,
            localLookup,
            rootRemoteRequirementLookup: remoteRequirementLookup,
            remoteDependencyDetails,
            copy,
            rootImageUrl,
            path: nextPath,
          }),
        )
      : []
  const children =
    !cycle && remoteLoad?.state === 'ready'
      ? uniqueNonEmpty(remoteLoad.detail?.requirements?.map((child) => child.name) ?? []).map((childDependency) =>
          buildRemoteDependencyNode({
            requirementName: childDependency,
            ownerId: nodeId,
            localLookup,
            remoteRequirementLookup: buildRemoteRequirementLookup(remoteLoad.detail?.requirements),
            remoteDependencyDetails,
            copy,
            rootImageUrl: remoteLoad.detail?.imageUrl ?? rootImageUrl,
            path: nextPath,
          }),
        )
      : []
  const external = Boolean(requirement?.external || !modId)
  const missing = !localMatch && !external
  const disabled = Boolean(localMatch && localMatch.enabled === false)
  const transitive = Boolean(localMatch && localMissingSet.size > 0)
  const statusKind = resolveDependencyStatusKind({
    cycle,
    remoteState: remoteLoad?.state,
    external,
    missing,
    disabled,
    transitive,
  })
  const status = dependencyStatusLabel(statusKind, copy)

  return {
    id: nodeId,
    name: localMatch?.name ?? requirementName,
    meta: [
      localMatch ? copy.localRequirement : null,
      external ? copy.externalRequirement : copy.remoteRequirement,
      localMatch?.version ? normalizeVersion(localMatch.version, '') : null,
      requirement?.notes,
    ]
      .filter(Boolean)
      .join(' · '),
    status,
    statusKind,
    title: [localMatch?.name ?? requirementName, localMatch?.uniqueId, requirement?.notes, requirement?.url].filter(Boolean).join(' · '),
    children: [...localDependencyChildren, ...children],
    downloadable: missing && Boolean(modId),
    loadable: Boolean(missing && modId && remoteLoad?.state !== 'ready' && !cycle),
    loading: remoteLoad?.state === 'loading',
    modId,
    url: requirement?.url ?? localMatch?.modUrl ?? null,
    imageUrl: localMatch?.imageUrl ?? rootImageUrl ?? null,
    version: localMatch?.version ?? remoteLoad?.detail?.primaryFileVersion ?? remoteLoad?.detail?.version ?? null,
  }
}

function collectExpandedDependencyNodeIds(nodes: DependencyTreeNode[], expanded = new Set<string>()) {
  nodes.forEach((node) => {
    if (node.children.length > 0) {
      expanded.add(node.id)
    }
    if (node.children.length > 0 && node.statusKind !== 'satisfied') {
      collectExpandedDependencyNodeIds(node.children, expanded)
      return
    }
    node.children.forEach((child) => {
      if (child.statusKind !== 'satisfied') {
        expanded.add(node.id)
        collectExpandedDependencyNodeIds([child], expanded)
      }
    })
  })
  return expanded
}

function countDependencyIssues(nodes: DependencyTreeNode[]): number {
  return nodes.reduce((count, node) => {
    const ownIssue =
      node.statusKind === 'missing' || node.statusKind === 'disabled' || node.statusKind === 'transitive' || node.statusKind === 'error'
    return count + (ownIssue ? 1 : 0) + countDependencyIssues(node.children)
  }, 0)
}

type LauncherModDetailPanelProps = {
  open: boolean
  onClose: () => void
  mod: LauncherDetailMod | null
  remoteDetail?: LauncherDiscoverDetail | null
  onToggleEnabled: () => void
  onOpenFolder: () => void
  onSetCover: () => void
  onClearCover: () => void
  packName?: string | null
  onQueueDownload?: (input: QueueLauncherDownloadInput) => void
  remoteLoading?: boolean
  remoteFilesDeferred?: boolean
  libraryMods?: LauncherLibraryItem[]
}

export function LauncherModDetailPanel({
  open,
  onClose,
  mod,
  remoteDetail,
  onToggleEnabled,
  onOpenFolder,
  onSetCover,
  onClearCover,
  packName,
  onQueueDownload,
  remoteLoading = false,
  remoteFilesDeferred = false,
  libraryMods = [],
}: LauncherModDetailPanelProps) {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy()
  const launcherCopy = copy.launcher
  const detailCopy = launcherCopy.library.modDetail
  const [activeTab, setActiveTab] = useState<LauncherDetailTab>('description')
  const [descriptionReaderOpen, setDescriptionReaderOpen] = useState(false)
  const [remoteDependencyDetails, setRemoteDependencyDetails] = useState<Record<number, RemoteDependencyLoadState>>({})
  const [expandedDependencyNodeIds, setExpandedDependencyNodeIds] = useState<Set<string>>(new Set())
  const detailContentKey = `${mod?.id ?? 'empty'}:${remoteDetail?.modId ?? mod?.nexusModId ?? 'local'}`
  const deferDetailContent = shouldDeferDetailContent()
  const [readyContentKey, setReadyContentKey] = useState(() => (!deferDetailContent ? detailContentKey : null))
  const contentReady = !deferDetailContent || readyContentKey === detailContentKey
  const fallbackPalette = getLauncherCardFallbackPalette(mod?.name ?? remoteDetail?.title ?? launcherCopy.library.detailsTitle)
  const coverWord = getLauncherCardCoverWord(mod?.name ?? remoteDetail?.title ?? launcherCopy.library.detailsTitle)
  const fetchedRemote = useLauncherRemoteModDetail(
    open && !remoteDetail && mod?.nexusModId ? mod.nexusModId : null,
    remoteFilesDeferred ? { includeFiles: false } : {},
  )
  const deferredFilesModId = remoteDetail?.modId ?? fetchedRemote.detail?.modId ?? mod?.nexusModId ?? null
  const shouldFetchDeferredFiles =
    open && remoteFilesDeferred && (activeTab === 'files' || activeTab === 'changelog') && deferredFilesModId ? deferredFilesModId : null
  const fetchedRemoteWithFiles = useLauncherRemoteModDetail(shouldFetchDeferredFiles, {
    includeFiles: true,
    notify: false,
  })
  const deferredFilesLoading = Boolean(shouldFetchDeferredFiles && fetchedRemoteWithFiles.state === 'loading')
  const remote = fetchedRemoteWithFiles.detail ?? remoteDetail ?? fetchedRemote.detail
  const showRemoteLoading =
    remoteLoading || Boolean(open && !remoteDetail && mod?.nexusModId && fetchedRemote.state === 'loading') || deferredFilesLoading
  const fallbackRemoteModId = mod?.nexusModId ?? null
  const isLocal = Boolean(mod?.absolutePath)
  const isNexus = Boolean(remote)
  const isCombined = isLocal && isNexus
  const overviewDescription = remote?.summary ?? mod?.description ?? launcherCopy.states.noSummary
  const fullDescription = remote?.description ?? remote?.summary ?? mod?.description ?? launcherCopy.states.noSummary
  const latestVersion = remote?.primaryFileVersion ?? remote?.version ?? null
  const updateAvailable = isCombined && hasUpdate(mod?.version, latestVersion)
  const coverStyle = {
    '--launcher-cover-bright': fallbackPalette.bright,
    '--launcher-cover-base': fallbackPalette.base,
    '--launcher-cover-dark': fallbackPalette.dark,
    '--launcher-cover-edge': fallbackPalette.edge,
    '--launcher-cover-glow': fallbackPalette.glow,
    '--launcher-cover-shadow': fallbackPalette.shadow,
  } as CSSProperties

  const displayName = mod?.name ?? remote?.title ?? launcherCopy.library.detailsTitle
  const displayAuthor = mod?.author ?? remote?.author ?? launcherCopy.library.detailsSubtitle
  const displayVersion = isCombined
    ? `${detailCopy.installedVersionShort} ${normalizeVersion(mod?.version, copy.common.none)} · ${detailCopy.nexusVersionShort} ${normalizeVersion(latestVersion, copy.common.none)}`
    : normalizeVersion(mod?.version ?? latestVersion, copy.common.none)
  const category = remote?.category ?? packName ?? null
  const subtitleText = [displayAuthor ? `${detailCopy.byAuthor} ${displayAuthor}` : null, displayVersion, category]
    .filter(Boolean)
    .join(' · ')

  const dependencyText = mod?.missingRequiredDependencies?.length ? mod.missingRequiredDependencies.join(', ') : detailCopy.clean
  const primaryFileName = remote?.primaryFileName ?? (remote ? remote.title : null)
  const primaryFileId = remote?.primaryFileId ? `#${remote.primaryFileId}` : copy.common.none
  const primarySize = formatSize(remote?.primaryFileSize ?? remote?.fileSize, remote?.primaryFileSizeBytes, copy.common.none)
  const rawLocalDependencies = mod?.requiredDependencies?.length ? mod.requiredDependencies : (mod?.missingRequiredDependencies ?? [])
  const localDependencies = uniqueNonEmpty(rawLocalDependencies)
  const remoteRequirements = (remote?.requirements ?? []).filter((requirement) => requirement.name.trim() !== '')
  const dependencyCopy: DependencyCopy = {
    localRequirement: detailCopy.localRequirement,
    remoteRequirement: detailCopy.remoteRequirement,
    externalRequirement: detailCopy.externalRequirement,
    missing: detailCopy.missing,
    satisfied: detailCopy.satisfied,
    disabled: detailCopy.disabledDependency,
    dependencyIssue: detailCopy.dependencyIssue,
    loading: detailCopy.dependencyLoading,
    loadError: detailCopy.dependencyLoadError,
    cycle: detailCopy.dependencyCycle,
  }
  const localDependencyLookup = buildLocalDependencyLookup(libraryMods, mod)
  const rootRemoteRequirementLookup = buildRemoteRequirementLookup(remoteRequirements)
  const rootDependencyNames = mergeDependencyNames([...localDependencies, ...remoteRequirements.map((requirement) => requirement.name)])
  const dependencyTreeItems = rootDependencyNames.map((dependencyName) =>
    buildLocalDependencyNode({
      dependencyName,
      ownerId: `root:${mod?.uniqueId ?? remote?.modId ?? 'detail'}`,
      localLookup: localDependencyLookup,
      rootRemoteRequirementLookup,
      remoteDependencyDetails,
      copy: dependencyCopy,
      rootImageUrl: remote?.imageUrl ?? mod?.imageUrl ?? null,
      path: new Set([normalizeDependencyMatchKey(mod?.uniqueId ?? remote?.title ?? '')].filter(Boolean)),
    }),
  )
  const remoteFiles = (remote?.files ?? []).filter((file) => (file.name ?? '').trim() !== '' || file.fileId)
  const changelogItems = buildChangelogItems({
    primaryLines: remote?.primaryFileChangelog,
    primarySource: primaryFileName ?? detailCopy.primaryFile,
    primaryVersion: latestVersion,
    files: remoteFiles,
    noneLabel: copy.common.none,
  })
  const hasDependencyData = dependencyTreeItems.length > 0
  const hasDeferredFileData = Boolean(remoteFilesDeferred && deferredFilesModId && onQueueDownload)
  const hasFileData = isNexus && (remoteFiles.length > 0 || hasDeferredFileData)
  const hasChangelogData = isNexus && (changelogItems.length > 0 || Boolean(remoteFilesDeferred && deferredFilesModId))
  const detailTabs: LauncherDetailTab[] = ['description']
  if (hasChangelogData) {
    detailTabs.push('changelog')
  }
  detailTabs.push('details')
  if (hasDependencyData) {
    detailTabs.push('dependencies')
  }
  if (hasFileData) {
    detailTabs.push('files')
  }
  const selectedTab = detailTabs.includes(activeTab) ? activeTab : 'description'
  const showDescriptionReader = open && selectedTab === 'description' && descriptionReaderOpen
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

  const dependencyIssueCount = countDependencyIssues(dependencyTreeItems)
  const missingDependencyCount = dependencyIssueCount
  const missingDependencyLabel = missingDependencyCount ? launcherCopy.library.missingDependenciesCount(missingDependencyCount) : null

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

  const handleClose = useCallback(() => {
    setDescriptionReaderOpen(false)
    if (deferDetailContent) {
      setReadyContentKey(null)
    }
    onClose()
  }, [deferDetailContent, onClose])

  const handleSelectTab = (tab: LauncherDetailTab) => {
    if (tab !== 'description') {
      setDescriptionReaderOpen(false)
    }
    setActiveTab(tab)
  }

  useEffect(() => {
    setRemoteDependencyDetails({})
  }, [detailContentKey])

  useEffect(() => {
    setExpandedDependencyNodeIds(collectExpandedDependencyNodeIds(dependencyTreeItems))
  }, [detailContentKey, dependencyIssueCount, dependencyTreeItems.length])

  useEffect(() => {
    if (!open) {
      return
    }

    if (!deferDetailContent) {
      return
    }

    const frameId = window.requestAnimationFrame(() => setReadyContentKey(detailContentKey))
    return () => window.cancelAnimationFrame(frameId)
  }, [deferDetailContent, detailContentKey, open])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showDescriptionReader) {
          setDescriptionReaderOpen(false)
          return
        }
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose, open, showDescriptionReader])

  const openRemotePage = () => {
    const url = remote?.modUrl ?? mod?.modUrl
    if (url) {
      void launcherPort.openUrl({ url })
    }
  }

  const handleDownloadRemoteFile = (item: FileListItem) => {
    const modId = remote?.modId ?? fallbackRemoteModId
    if (onQueueDownload && modId) {
      onQueueDownload({
        modId,
        fileId: item.fileId,
        title: remote?.title ?? mod?.name ?? item.name,
        imageUrl: remote?.imageUrl ?? mod?.imageUrl ?? null,
        version: item.version ?? latestVersion,
        source: isLocal ? 'updates' : 'discover',
      })
    }
  }

  const handleDownloadDependency = (item: DependencyTreeNode) => {
    if (onQueueDownload && item.modId) {
      onQueueDownload({
        modId: item.modId,
        title: item.name,
        imageUrl: item.imageUrl ?? null,
        version: item.version ?? null,
        source: isLocal ? 'updates' : 'discover',
      })
    }
  }

  const handleOpenDependencyPage = (item: DependencyTreeNode) => {
    const url = item.url ?? (item.modId ? `https://www.nexusmods.com/stardewvalley/mods/${item.modId}` : null)
    if (url) {
      void launcherPort.openUrl({ url })
    }
  }

  const handleToggleDependencyNode = (item: DependencyTreeNode) => {
    setExpandedDependencyNodeIds((current) => {
      const next = new Set(current)
      if (next.has(item.id)) {
        next.delete(item.id)
      } else {
        next.add(item.id)
      }
      return next
    })

    if (!item.loadable || !item.modId || remoteDependencyDetails[item.modId]?.state === 'loading') {
      return
    }

    setRemoteDependencyDetails((current) => ({
      ...current,
      [item.modId as number]: { state: 'loading' },
    }))
    void launcherPort
      .loadRemoteModDetail({ modId: item.modId, includeFiles: false })
      .then((detail) => {
        setRemoteDependencyDetails((current) => ({
          ...current,
          [item.modId as number]: { state: 'ready', detail },
        }))
      })
      .catch((error: unknown) => {
        setRemoteDependencyDetails((current) => ({
          ...current,
          [item.modId as number]: { state: 'error', error: error instanceof Error ? error.message : String(error) },
        }))
      })
  }

  if (!open) {
    return null
  }

  return (
    <aside className={cx('launcher-library-drawer', open && 'launcher-library-drawer-open')}>
      <button
        type="button"
        className="launcher-library-drawer-backdrop"
        aria-label={launcherCopy.actions.closeDialog}
        onClick={handleClose}
      />

      <section className="launcher-library-drawer-panel launcher-mod-detail-panel" role="dialog" aria-modal="true" aria-label={displayName}>
        {showRemoteLoading ? (
          <div className="launcher-mod-detail-loading-overlay" role="status">
            <div className="launcher-mod-detail-loading-card">
              <span className="launcher-mod-detail-loading-bar" aria-hidden="true" />
              <div>
                <span>{launcherCopy.updates.detailsLoading}</span>
                <i aria-hidden="true" />
              </div>
            </div>
          </div>
        ) : null}

        {!contentReady ? (
          <>
            <button
              type="button"
              className="icon-button launcher-mod-detail-close-button launcher-mod-detail-shell-close-button"
              onClick={handleClose}
              aria-label={launcherCopy.actions.closeDialog}
              title={launcherCopy.actions.closeDialog}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="launcher-mod-detail-shell-pending" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </>
        ) : !mod && !remote ? (
          <div className="launcher-library-drawer-body">
            <PanelEmptyState>{launcherCopy.library.selectionEmpty}</PanelEmptyState>
          </div>
        ) : (
          <>
            <header className="launcher-mod-detail-hero">
              <div className="launcher-mod-detail-cover-frame">
                <LauncherArtworkCover
                  title={displayName}
                  imageUrl={mod?.imageUrl ?? remote?.imageUrl ?? null}
                  coverStyle={coverStyle}
                  coverWord={coverWord}
                  className="launcher-mod-detail-cover"
                />
              </div>

              <div className="launcher-mod-detail-hero-main">
                <button
                  type="button"
                  className="icon-button launcher-mod-detail-close-button"
                  onClick={handleClose}
                  aria-label={launcherCopy.actions.closeDialog}
                  title={launcherCopy.actions.closeDialog}
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="launcher-mod-detail-status-overview">
                  <div className="launcher-mod-detail-status-primary">
                    <div className="launcher-mod-detail-status-heading">
                      <h2 className="launcher-mod-detail-status-title" title={displayName}>
                        {displayName}
                      </h2>
                      <div className="launcher-mod-detail-status-meta-line">
                        <span className={cx('launcher-mod-detail-update-badge', updateAvailable && 'is-update')}>
                          {updateAvailable ? detailCopy.updateAvailable : isLocal ? detailCopy.installed : detailCopy.nexus}
                        </span>
                        <p title={subtitleText}>
                          {displayAuthor ? (
                            <>
                              {detailCopy.byAuthor} <strong>{displayAuthor}</strong>
                            </>
                          ) : null}
                          {displayAuthor && category ? ' · ' : null}
                          {category ? <strong>{category}</strong> : null}
                        </p>
                      </div>
                    </div>

                    {isCombined ? (
                      <div className="launcher-mod-detail-version-compare">
                        <div className="launcher-mod-detail-version-node">
                          <span>{detailCopy.currentFolder}</span>
                          <strong>{normalizeVersion(mod?.version, copy.common.none)}</strong>
                          <button
                            type="button"
                            className={cx('launcher-mod-detail-version-state', !mod?.enabled && 'is-off')}
                            onClick={onToggleEnabled}
                            title={mod?.enabled ? launcherCopy.actions.disable : launcherCopy.actions.enable}
                          >
                            {mod?.enabled ? launcherCopy.overview.enabledMods : launcherCopy.overview.disabledMods} · {dependencyText}
                          </button>
                        </div>
                        <div className="launcher-mod-detail-version-arrow" aria-hidden="true">
                          →
                        </div>
                        <div className="launcher-mod-detail-version-node">
                          <span>{detailCopy.nexusPrimaryFile}</span>
                          <strong className="latest">{normalizeVersion(latestVersion, copy.common.none)}</strong>
                          <em>
                            {detailCopy.size}: {primarySize}
                          </em>
                        </div>
                      </div>
                    ) : (
                      <div className={cx('launcher-mod-detail-version-compare single', isNexus && 'nexus')}>
                        <div className="launcher-mod-detail-version-node">
                          <span>{isNexus ? detailCopy.nexusPrimaryFile : detailCopy.installed}</span>
                          <strong>{displayVersion}</strong>
                          {isLocal ? (
                            <button
                              type="button"
                              className={cx('launcher-mod-detail-version-state', !mod?.enabled && 'is-off')}
                              onClick={onToggleEnabled}
                              title={mod?.enabled ? launcherCopy.actions.disable : launcherCopy.actions.enable}
                            >
                              {mod?.enabled ? launcherCopy.overview.enabledMods : launcherCopy.overview.disabledMods} · {dependencyText}
                            </button>
                          ) : (
                            <em>
                              {detailCopy.size}: {primarySize}
                            </em>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="launcher-mod-detail-hero-summary">
                      <NexusModsBbcode source={overviewDescription} />
                    </div>
                  </div>

                  <aside className="launcher-mod-detail-status-side" aria-label={detailCopy.metadata}>
                    {localHeroRows.length ? (
                      <div className="launcher-mod-detail-status-group">
                        {localHeroRows.map((row) => (
                          <PropertyRow key={row.label} row={row} />
                        ))}
                      </div>
                    ) : null}
                    {remoteHeroRows.length ? (
                      <div className="launcher-mod-detail-status-group">
                        {remoteHeroRows.map((row) => (
                          <PropertyRow key={row.label} row={row} />
                        ))}
                      </div>
                    ) : null}
                  </aside>
                </div>
              </div>
            </header>

            <div className="launcher-mod-detail-body">
              <main className="launcher-mod-detail-main">
                <div className="launcher-mod-detail-tabs" role="tablist" aria-label={detailCopy.tabsLabel}>
                  {detailTabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={selectedTab === tab}
                      onClick={() => handleSelectTab(tab)}
                      title={tab === 'dependencies' && missingDependencyLabel ? missingDependencyLabel : undefined}
                    >
                      <span>{detailCopy.tabs[tab]}</span>
                      {tab === 'dependencies' && missingDependencyCount ? (
                        <strong className="launcher-mod-detail-tab-alert" aria-hidden="true">
                          {missingDependencyCount}
                        </strong>
                      ) : null}
                    </button>
                  ))}
                </div>

                <section
                  className={cx('launcher-mod-detail-tab-panel', selectedTab === 'description' && 'active')}
                  role="tabpanel"
                  hidden={selectedTab !== 'description'}
                  aria-hidden={selectedTab !== 'description'}
                >
                  <div className="launcher-mod-detail-description">
                    {selectedTab === 'description' ? <NexusModsBbcode source={fullDescription} /> : null}
                    {selectedTab === 'description' ? (
                      <button type="button" className="control-button" onClick={() => setDescriptionReaderOpen(true)}>
                        {detailCopy.readFullDescription}
                      </button>
                    ) : null}
                  </div>
                </section>

                {hasChangelogData && selectedTab === 'changelog' ? (
                  <section
                    className={cx('launcher-mod-detail-tab-panel', selectedTab === 'changelog' && 'active')}
                    role="tabpanel"
                    hidden={selectedTab !== 'changelog'}
                    aria-hidden={selectedTab !== 'changelog'}
                  >
                    <div className="launcher-mod-detail-info-layout rich scrollable">
                      {selectedTab === 'changelog' ? (
                        deferredFilesLoading ? (
                          <DetailDataLoading label={detailCopy.filesLoading} />
                        ) : (
                          <ChangelogList items={changelogItems} emptyLabel={detailCopy.changelogEmpty} />
                        )
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {selectedTab === 'details' ? (
                  <section
                    className={cx('launcher-mod-detail-tab-panel', selectedTab === 'details' && 'active')}
                    role="tabpanel"
                    hidden={selectedTab !== 'details'}
                    aria-hidden={selectedTab !== 'details'}
                  >
                    {isCombined ? (
                      <div className="launcher-mod-detail-info-layout combined">
                        <DetailSection title={detailCopy.installPath} rows={localDetails} />
                        <DetailSection title={detailCopy.updateEvidence} rows={updateEvidenceDetails} />
                      </div>
                    ) : isNexus ? (
                      <div className="launcher-mod-detail-info-layout only">
                        <DetailSection title={detailCopy.nexusPage} rows={nexusPageDetails} tone="graphql" />
                        <DetailSection title={detailCopy.primaryFile} rows={primaryFileDetails} />
                      </div>
                    ) : (
                      <div className="launcher-mod-detail-info-layout only">
                        <DetailSection title={detailCopy.install} rows={localDetails} />
                        <DetailSection title={detailCopy.manifest} rows={manifestDetails} />
                      </div>
                    )}
                  </section>
                ) : null}

                {hasDependencyData && selectedTab === 'dependencies' ? (
                  <section
                    className={cx('launcher-mod-detail-tab-panel', selectedTab === 'dependencies' && 'active')}
                    role="tabpanel"
                    hidden={selectedTab !== 'dependencies'}
                    aria-hidden={selectedTab !== 'dependencies'}
                  >
                    <div className="launcher-mod-detail-info-layout rich scrollable">
                      <div className="launcher-mod-detail-rich-head">
                        <span>{detailCopy.tabs.dependencies}</span>
                        <strong>{dependencyTreeItems.length}</strong>
                      </div>
                      <DependencyTree
                        items={dependencyTreeItems}
                        expandedNodeIds={expandedDependencyNodeIds}
                        labels={{
                          download: detailCopy.downloadDependency,
                          openPage: launcherCopy.actions.openModPage,
                          expand: detailCopy.expandDependency,
                          collapse: detailCopy.collapseDependency,
                          loadChildren: detailCopy.loadDependencyChildren,
                        }}
                        onToggleNode={handleToggleDependencyNode}
                        onDownloadDependency={handleDownloadDependency}
                        onOpenDependencyPage={handleOpenDependencyPage}
                      />
                    </div>
                  </section>
                ) : null}

                {hasFileData && selectedTab === 'files' ? (
                  <section
                    className={cx('launcher-mod-detail-tab-panel', selectedTab === 'files' && 'active')}
                    role="tabpanel"
                    hidden={selectedTab !== 'files'}
                    aria-hidden={selectedTab !== 'files'}
                  >
                    <div className="launcher-mod-detail-info-layout rich scrollable">
                      {selectedTab === 'files' && deferredFilesLoading ? (
                        <DetailDataLoading label={detailCopy.filesLoading} />
                      ) : selectedTab === 'files' ? (
                        <FileList
                          items={fileItems}
                          labels={{
                            main: detailCopy.mainFiles,
                            optional: detailCopy.optionalFiles,
                            old: detailCopy.oldFiles,
                            oldAndArchived: detailCopy.oldAndArchivedFiles,
                          }}
                          actionLabel={launcherCopy.actions.queueDownload}
                          onDownloadFile={handleDownloadRemoteFile}
                        />
                      ) : null}
                    </div>
                  </section>
                ) : null}
              </main>
            </div>

            {showDescriptionReader ? (
              <div className="launcher-mod-detail-reader" role="dialog" aria-modal="false" aria-label={detailCopy.fullDescriptionTitle}>
                <div className="launcher-mod-detail-reader-head">
                  <div>
                    <h2>{detailCopy.fullDescriptionTitle}</h2>
                    <p>{displayName}</p>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setDescriptionReaderOpen(false)}
                    aria-label={launcherCopy.actions.closeDialog}
                    title={launcherCopy.actions.closeDialog}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <article className="launcher-mod-detail-reader-body">
                  <NexusModsBbcode source={fullDescription} />
                </article>
              </div>
            ) : null}

            <footer className="launcher-mod-detail-footer">
              <div className="launcher-mod-detail-tool-group">
                {isLocal ? (
                  <button
                    type="button"
                    className="launcher-mod-detail-tool-button"
                    onClick={onOpenFolder}
                    title={launcherCopy.actions.openFolder}
                    aria-label={launcherCopy.actions.openFolder}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                ) : null}
                {isLocal ? (
                  <button
                    type="button"
                    className="launcher-mod-detail-tool-button"
                    onClick={mod?.imageUrl ? onClearCover : onSetCover}
                    title={mod?.imageUrl ? launcherCopy.actions.clearCover : launcherCopy.actions.setCover}
                    aria-label={mod?.imageUrl ? launcherCopy.actions.clearCover : launcherCopy.actions.setCover}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                ) : null}
                {(remote?.modUrl ?? mod?.modUrl) ? (
                  <button
                    type="button"
                    className="launcher-mod-detail-tool-button"
                    onClick={openRemotePage}
                    title={launcherCopy.actions.openModPage}
                    aria-label={launcherCopy.actions.openModPage}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                className="control-button control-button-primary launcher-mod-detail-primary-action"
                onClick={() => {
                  if (isCombined && updateAvailable) {
                    const primaryFile = fileItems.find((item) => item.primary) ?? fileItems[0]
                    if (primaryFile) {
                      handleDownloadRemoteFile(primaryFile)
                      return
                    }
                  }

                  if (!isLocal && isNexus) {
                    const primaryFile = fileItems.find((item) => item.primary) ?? fileItems[0]
                    if (primaryFile) {
                      handleDownloadRemoteFile(primaryFile)
                      return
                    }
                    openRemotePage()
                    return
                  }

                  onOpenFolder()
                }}
              >
                {isCombined
                  ? updateAvailable
                    ? detailCopy.updateNow
                    : detailCopy.reinstall
                  : isNexus
                    ? launcherCopy.actions.queueDownload
                    : launcherCopy.actions.openFolder}
              </button>
            </footer>
          </>
        )}
      </section>
    </aside>
  )
}
