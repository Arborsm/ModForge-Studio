import type { LauncherDiscoverDetail, LauncherLibraryItem } from '../../../model/types'
import type { DependencyTreeNode, DependencyTreeNodeStatus } from '../launcherModDetailData'
import { normalizeVersion } from '../launcherModDetailData'
import {
  buildDependencySearchQuery,
  buildLocalDependencyLookup,
  buildRemoteRequirementLookup,
  findLocalDependency,
  findLocalDependencyByNexusModId,
  findRemoteRequirement,
  getLocalDependencyNames,
  getLocalDependencyRequirement,
  isOptionalRemoteRequirement,
  isSmapiDependencyName,
  mergeDependencyNames,
  normalizeDependencyMatchKey,
  type LocalDependencyLookup,
  uniqueNonEmpty,
} from './dependencyMatching'
import { collectExpandedDependencyNodeIds, collectLoadableDependencyModIds, countDependencyIssues } from './dependencyTreeSelectors'
import type { DependencyTreeCopy, LauncherDetailMod, RemoteDependencyLoadState } from './dependencyTreeTypes'

export type BuildLauncherDependencyTreeInput = {
  mod: LauncherDetailMod | null
  remote: LauncherDiscoverDetail | null | undefined
  libraryMods: LauncherLibraryItem[]
  remoteDependencyDetails: Record<number, RemoteDependencyLoadState>
  copy: DependencyTreeCopy
  rootImageUrl: string | null | undefined
}

export type LauncherDependencyTreeModel = {
  items: DependencyTreeNode[]
  issueCount: number
  expandedNodeIds: Set<string>
  expandedNodeKey: string
  loadableModIds: Set<number>
}

function getMissingDependencySet(mod: LauncherDetailMod | LauncherLibraryItem | null | undefined) {
  return new Set((mod?.missingRequiredDependencies ?? []).map((item) => item.trim()).filter(Boolean))
}

type DependencyStatusInput = {
  cycle?: boolean
  remoteState?: RemoteDependencyLoadState['state']
  external?: boolean
  optional?: boolean
  missing?: boolean
  disabled?: boolean
  transitive?: boolean
}

type DependencyStatusModel = {
  kind: DependencyTreeNodeStatus
  label: string
}

function dependencyStatus(kind: DependencyTreeNodeStatus, label: string): DependencyStatusModel {
  return { kind, label }
}

function resolveDependencyStatus(input: DependencyStatusInput, copy: DependencyTreeCopy, smapiLoader = false): DependencyStatusModel {
  if (input.cycle) return dependencyStatus('cycle', copy.cycle)
  if (input.remoteState === 'loading') return dependencyStatus('loading', copy.loading)
  if (input.remoteState === 'error') return dependencyStatus('error', copy.loadError)
  if (input.external) return dependencyStatus('external', smapiLoader ? copy.modLoaderRequirement : copy.externalRequirement)
  if (input.optional) return dependencyStatus('optional', copy.optional)
  if (input.missing) return dependencyStatus('missing', copy.missing)
  if (input.disabled) return dependencyStatus('disabled', copy.disabled)
  if (input.transitive) return dependencyStatus('transitive', copy.dependencyIssue)
  return dependencyStatus('satisfied', copy.satisfied)
}

/**
 * Keeps the first node per resolved id within one sibling list. Name-level merging cannot catch
 * references spelled differently (manifest UniqueID vs Nexus requirement name) that still resolve
 * to the same mod, and those would produce duplicate React keys.
 */
function uniqueDependencyNodes(nodes: DependencyTreeNode[]) {
  const seen = new Set<string>()
  return nodes.filter((node) => {
    if (seen.has(node.id)) {
      return false
    }
    seen.add(node.id)
    return true
  })
}

function buildLocalDependencyNode({
  dependencyName,
  ownerId,
  ownerLocalMod,
  inheritedOptional = false,
  localLookup,
  rootRemoteRequirementLookup,
  remoteDependencyDetails,
  copy,
  rootImageUrl,
  path,
}: {
  dependencyName: string
  ownerId: string
  ownerLocalMod?: LauncherDetailMod | LauncherLibraryItem | null
  inheritedOptional?: boolean
  localLookup: LocalDependencyLookup
  rootRemoteRequirementLookup: Map<string, NonNullable<LauncherDiscoverDetail['requirements']>[number]>
  remoteDependencyDetails: Record<number, RemoteDependencyLoadState>
  copy: DependencyTreeCopy
  rootImageUrl: string | null | undefined
  path: Set<string>
}): DependencyTreeNode {
  const remoteRequirement = findRemoteRequirement(rootRemoteRequirementLookup, dependencyName)
  const localMatch =
    findLocalDependencyByNexusModId(localLookup, remoteRequirement?.modId) ?? findLocalDependency(localLookup, dependencyName)
  const dependencyKey = normalizeDependencyMatchKey(localMatch?.uniqueId ?? dependencyName)
  const localManifestDependency = getLocalDependencyRequirement(ownerLocalMod, dependencyName)
  const localManifestReference = Boolean(dependencyName.trim())
  const smapiLoader = isSmapiDependencyName(dependencyName) || Boolean(remoteRequirement && isSmapiDependencyName(remoteRequirement.name))
  const optional =
    inheritedOptional ||
    Boolean(localManifestDependency && !localManifestDependency.required) ||
    isOptionalRemoteRequirement(remoteRequirement)
  const remoteModId = smapiLoader ? null : (remoteRequirement?.modId ?? localMatch?.nexusModId ?? null)
  const remoteLoad = remoteModId ? remoteDependencyDetails[remoteModId] : undefined
  const dependencyDisplayName = localMatch?.name ?? remoteLoad?.detail?.title ?? dependencyName
  const searchQuery = buildDependencySearchQuery(dependencyDisplayName, dependencyName)
  const nodeId = `${ownerId}:${dependencyKey}:${remoteModId ?? 'local'}`
  const title = [dependencyDisplayName, localMatch?.uniqueId, remoteRequirement?.notes, remoteRequirement?.url].filter(Boolean).join(' · ')

  if (path.has(dependencyKey)) {
    return {
      id: `${nodeId}:cycle`,
      name: dependencyDisplayName,
      meta: copy.localRequirement,
      status: copy.cycle,
      statusKind: 'cycle',
      title,
      children: [],
      modId: remoteModId,
      url: remoteRequirement?.url ?? localMatch?.modUrl ?? null,
      searchQuery,
      imageUrl: localMatch?.imageUrl ?? rootImageUrl ?? null,
      version: localMatch?.version ?? null,
    }
  }

  const localMissingSet = getMissingDependencySet(localMatch)
  const localChildren = getLocalDependencyNames(localMatch)
  const nextPath = new Set(path)
  nextPath.add(dependencyKey)
  const children = uniqueDependencyNodes(
    localChildren.map((childDependency) =>
      buildLocalDependencyNode({
        dependencyName: childDependency,
        ownerId: nodeId,
        ownerLocalMod: localMatch,
        inheritedOptional: optional,
        localLookup,
        rootRemoteRequirementLookup,
        remoteDependencyDetails,
        copy,
        rootImageUrl,
        path: nextPath,
      }),
    ),
  )

  const externalOnly = smapiLoader || (!localMatch && Boolean(remoteRequirement?.external))
  const missing = !optional && !localMatch && !externalOnly
  const disabled = Boolean(localMatch && localMatch.enabled === false)
  const transitive = !optional && Boolean(localMatch && localMissingSet.size > 0)
  const statusRemoteState = externalOnly ? remoteLoad?.state : undefined
  const remoteChildren =
    !localMatch && remoteLoad?.state === 'ready'
      ? uniqueDependencyNodes(
          uniqueNonEmpty(remoteLoad.detail?.requirements?.map((requirement) => requirement.name) ?? []).map((childDependency) =>
            buildRemoteDependencyNode({
              requirementName: childDependency,
              ownerId: nodeId,
              ownerLocalMod: null,
              inheritedOptional: optional,
              localLookup,
              remoteRequirementLookup: buildRemoteRequirementLookup(remoteLoad.detail?.requirements),
              remoteDependencyDetails,
              copy,
              rootImageUrl: remoteLoad.detail?.imageUrl ?? rootImageUrl,
              path: nextPath,
            }),
          ),
        )
      : []
  const status = resolveDependencyStatus(
    {
      remoteState: statusRemoteState,
      external: externalOnly,
      optional,
      missing,
      disabled,
      transitive,
    },
    copy,
    smapiLoader,
  )
  const meta = [
    localMatch || localManifestReference ? copy.localRequirement : null,
    remoteRequirement || smapiLoader
      ? remoteRequirement?.external || externalOnly
        ? copy.externalRequirement
        : copy.remoteRequirement
      : null,
    localMatch?.version ? normalizeVersion(localMatch.version, '') : null,
    remoteRequirement?.notes,
    remoteLoad?.state === 'loading' ? copy.loading : null,
    remoteLoad?.state === 'error' ? copy.loadError : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    id: nodeId,
    name: dependencyDisplayName,
    meta,
    status: status.label,
    statusKind: status.kind,
    title,
    children: [...children, ...remoteChildren],
    downloadable: !optional && missing && Boolean(remoteModId),
    loadable: !optional && Boolean(remoteModId) && !localMatch && remoteLoad?.state !== 'ready',
    loading: remoteLoad?.state === 'loading',
    modId: remoteModId,
    url: remoteRequirement?.url ?? localMatch?.modUrl ?? null,
    searchQuery,
    imageUrl: localMatch?.imageUrl ?? rootImageUrl ?? null,
    version: localMatch?.version ?? remoteLoad?.detail?.primaryFileVersion ?? remoteLoad?.detail?.version ?? null,
  }
}

function buildRemoteDependencyNode({
  requirementName,
  ownerId,
  ownerLocalMod,
  inheritedOptional = false,
  localLookup,
  remoteRequirementLookup,
  remoteDependencyDetails,
  copy,
  rootImageUrl,
  path,
}: {
  requirementName: string
  ownerId: string
  ownerLocalMod?: LauncherDetailMod | LauncherLibraryItem | null
  inheritedOptional?: boolean
  localLookup: LocalDependencyLookup
  remoteRequirementLookup: Map<string, NonNullable<LauncherDiscoverDetail['requirements']>[number]>
  remoteDependencyDetails: Record<number, RemoteDependencyLoadState>
  copy: DependencyTreeCopy
  rootImageUrl: string | null | undefined
  path: Set<string>
}): DependencyTreeNode {
  const requirement = findRemoteRequirement(remoteRequirementLookup, requirementName)
  const localMatch = findLocalDependencyByNexusModId(localLookup, requirement?.modId) ?? findLocalDependency(localLookup, requirementName)
  const localManifestDependency = getLocalDependencyRequirement(ownerLocalMod, requirementName)
  const smapiLoader = isSmapiDependencyName(requirementName) || Boolean(requirement && isSmapiDependencyName(requirement.name))
  const optional =
    inheritedOptional || Boolean(localManifestDependency && !localManifestDependency.required) || isOptionalRemoteRequirement(requirement)
  const modId = smapiLoader ? null : (requirement?.modId ?? null)
  const remoteLoad = modId ? remoteDependencyDetails[modId] : undefined
  const dependencyDisplayName = localMatch?.name ?? remoteLoad?.detail?.title ?? requirementName
  const searchQuery = buildDependencySearchQuery(dependencyDisplayName, requirementName)
  const key = normalizeDependencyMatchKey(localMatch?.uniqueId ?? requirementName)
  const nodeId = `${ownerId}:remote:${key}:${modId ?? 'external'}`
  const cycle = path.has(key)
  const nextPath = new Set(path)
  nextPath.add(key)
  const localMissingSet = getMissingDependencySet(localMatch)
  const localChildren = getLocalDependencyNames(localMatch)
  const localDependencyChildren =
    !cycle && localChildren.length
      ? uniqueDependencyNodes(
          localChildren.map((childDependency) =>
            buildLocalDependencyNode({
              dependencyName: childDependency,
              ownerId: nodeId,
              ownerLocalMod: localMatch,
              inheritedOptional: optional,
              localLookup,
              rootRemoteRequirementLookup: remoteRequirementLookup,
              remoteDependencyDetails,
              copy,
              rootImageUrl,
              path: nextPath,
            }),
          ),
        )
      : []
  const children =
    !cycle && remoteLoad?.state === 'ready'
      ? uniqueDependencyNodes(
          uniqueNonEmpty(remoteLoad.detail?.requirements?.map((child) => child.name) ?? []).map((childDependency) =>
            buildRemoteDependencyNode({
              requirementName: childDependency,
              ownerId: nodeId,
              ownerLocalMod: null,
              inheritedOptional: optional,
              localLookup,
              remoteRequirementLookup: buildRemoteRequirementLookup(remoteLoad.detail?.requirements),
              remoteDependencyDetails,
              copy,
              rootImageUrl: remoteLoad.detail?.imageUrl ?? rootImageUrl,
              path: nextPath,
            }),
          ),
        )
      : []
  const external = Boolean(smapiLoader || requirement?.external || !modId)
  const missing = !optional && !localMatch && !external
  const disabled = Boolean(localMatch && localMatch.enabled === false)
  const transitive = !optional && Boolean(localMatch && localMissingSet.size > 0)
  const statusRemoteState = external ? remoteLoad?.state : undefined
  const status = resolveDependencyStatus(
    {
      cycle,
      remoteState: statusRemoteState,
      external,
      optional,
      missing,
      disabled,
      transitive,
    },
    copy,
    smapiLoader,
  )

  return {
    id: nodeId,
    name: dependencyDisplayName,
    meta: [
      localMatch ? copy.localRequirement : null,
      external ? copy.externalRequirement : copy.remoteRequirement,
      localMatch?.version ? normalizeVersion(localMatch.version, '') : null,
      requirement?.notes,
    ]
      .filter(Boolean)
      .join(' · '),
    status: status.label,
    statusKind: status.kind,
    title: [dependencyDisplayName, localMatch?.uniqueId, requirement?.notes, requirement?.url].filter(Boolean).join(' · '),
    children: [...localDependencyChildren, ...children],
    downloadable: !optional && missing && Boolean(modId),
    loadable: Boolean(!optional && modId && !localMatch && remoteLoad?.state !== 'ready' && !cycle),
    loading: remoteLoad?.state === 'loading',
    modId,
    url: requirement?.url ?? localMatch?.modUrl ?? null,
    searchQuery,
    imageUrl: localMatch?.imageUrl ?? rootImageUrl ?? null,
    version: localMatch?.version ?? remoteLoad?.detail?.primaryFileVersion ?? remoteLoad?.detail?.version ?? null,
  }
}

/** Builds the full dependency tree model while preserving complete preload/expand behavior. */
export function buildLauncherDependencyTree({
  mod,
  remote,
  libraryMods,
  remoteDependencyDetails,
  copy,
  rootImageUrl,
}: BuildLauncherDependencyTreeInput): LauncherDependencyTreeModel {
  const localDependencies = getLocalDependencyNames(mod)
  const remoteRequirements = (remote?.requirements ?? []).filter((requirement) => requirement.name.trim() !== '')
  const localDependencyLookup = buildLocalDependencyLookup(libraryMods, mod)
  const rootRemoteRequirementLookup = buildRemoteRequirementLookup(remoteRequirements)
  const rootDependencyNames = mergeDependencyNames([...localDependencies, ...remoteRequirements.map((requirement) => requirement.name)])
  const rootPath = new Set([normalizeDependencyMatchKey(mod?.uniqueId ?? remote?.title ?? '')].filter(Boolean))
  const ownerId = `root:${mod?.uniqueId ?? remote?.modId ?? 'detail'}`
  const items = uniqueDependencyNodes(
    rootDependencyNames.map((dependencyName) =>
      buildLocalDependencyNode({
        dependencyName,
        ownerId,
        ownerLocalMod: mod,
        localLookup: localDependencyLookup,
        rootRemoteRequirementLookup,
        remoteDependencyDetails,
        copy,
        rootImageUrl,
        path: rootPath,
      }),
    ),
  )

  const expandedNodeIds = collectExpandedDependencyNodeIds(items)
  return {
    items,
    issueCount: countDependencyIssues(items),
    expandedNodeIds,
    expandedNodeKey: Array.from(expandedNodeIds).join('|'),
    loadableModIds: collectLoadableDependencyModIds(items),
  }
}
