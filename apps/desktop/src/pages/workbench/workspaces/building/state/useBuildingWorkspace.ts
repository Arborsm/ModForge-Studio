import {useDeferredValue, useEffect, useMemo, useState} from 'react'
import type { ViewportWorldPoint } from '@shared/contracts'
import type { ModAssetIndexGroup } from '@shared/contracts'
import {deferToTimeout} from '@shared/lib/react'
import {type GameDirectoryInfo, loadMapAsset, loadTextAsset, scanMaps} from '@platform/desktop'
import type {BuildingsPanelCopy, LocaleCode} from '@locales'
import type {MapDocument} from '@shared/contracts'
import {OBJECT_DATA_ASSET_PATH, SPRING_OBJECTS_ASSET_PATH, buildGameContentPath} from '@shared/lib/assets'
import {
  BUILDINGS_DATA_ASSET_PATH,
  type BuildingTextureAssetState,
  type BuildingWorkspaceEntry,
  type ConstructibleBuildingGroup,
  createBuildingEntryIndex,
  createConstructibleBuildingGroups,
} from '../entities/building'
import { type BrowserSourceMode, buildModBrowserGroups, buildModEntryLookup, findModBrowserEntry, findModSources, type ModBrowserEntry } from '@pages/workbench/workspaces/mod'
import { useModAssetIndex } from '@pages/workbench/workspaces/mod'
import {loadModResultImageState} from '@pages/workbench/workspaces/mod'

import {localizeBuildingEntries} from './buildingTextLocalization'
import {buildObjectDisplayIndex, hydrateBuildingMaterials} from './buildingObjectDisplay'
import {buildLocationSeeds, buildWorldBuildingEntries} from './buildingWorldEntries'
import {loadImageState, loadChainTextureStates} from './buildingTextureAssets'
import {useActiveBuildingFallback} from './buildingSelection'

type UseBuildingWorkspaceOptions = {
  directoryInfo: GameDirectoryInfo | null
  locale: LocaleCode
  copy: BuildingsPanelCopy
}

const LOCATIONS_DATA_ASSET_PATH = 'Content\\Data\\Locations.xnb'

function getMapAssetName(document: MapDocument) {
  const normalizedRelativePath = document.relativePath.replaceAll('/', '\\').replace(/^Content\\/iu, '')
  return normalizedRelativePath.replace(/\.xnb$/iu, '').replaceAll('\\', '/')
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function consumeNext() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => consumeNext()))
  return results
}

export function useBuildingWorkspace({ directoryInfo, locale, copy }: UseBuildingWorkspaceOptions) {
  const [buildingEntries, setBuildingEntries] = useState<BuildingWorkspaceEntry[]>([])
  const [constructibleGroups, setConstructibleGroups] = useState<ConstructibleBuildingGroup[]>([])
  const [worldBuildings, setWorldBuildings] = useState<BuildingWorkspaceEntry[]>([])
  const [mapDocuments, setMapDocuments] = useState<MapDocument[]>([])
  const [buildingFilter, setBuildingFilter] = useState('')
  const [browserSourceMode, setBrowserSourceMode] = useState<BrowserSourceMode>('original')
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null)
  const [activeModBuildingSelectionId, setActiveModBuildingSelectionId] = useState<string | null>(null)
  const [buildingStatusMessage, setBuildingStatusMessage] = useState('')
  const [activeChainTextureStates, setActiveChainTextureStates] = useState<Record<string, BuildingTextureAssetState>>({})
  const [activeModTextureState, setActiveModTextureState] = useState<BuildingTextureAssetState | null>(null)
  const [springObjectsState, setSpringObjectsState] = useState<BuildingTextureAssetState>({
    path: null,
    url: null,
    width: null,
    height: null,
  })
  const { modIndex } = useModAssetIndex(directoryInfo)

  const deferredFilter = useDeferredValue(buildingFilter.trim().toLowerCase())
  const filteredConstructibleGroups = useMemo(
    () => constructibleGroups.filter((group) => !deferredFilter || group.searchText.includes(deferredFilter)),
    [constructibleGroups, deferredFilter],
  )
  const filteredWorldBuildings = useMemo(
    () => worldBuildings.filter((building) => !deferredFilter || building.searchText.includes(deferredFilter)),
    [deferredFilter, worldBuildings],
  )
  const buildingLookup = useMemo(
    () => buildModEntryLookup(buildingEntries, (building) => building.key),
    [buildingEntries],
  )
  const modBuildingGroups = useMemo(
    () =>
      buildModBrowserGroups({
        mods: modIndex.mods,
        selectReferences: (group: ModAssetIndexGroup) => group.buildings,
        entryLookup: buildingLookup,
        filterText: buildingFilter,
        getSearchText: (building: BuildingWorkspaceEntry) => building.searchText,
        getFallbackLabel: (building: BuildingWorkspaceEntry) => building.displayName,
      }),
    [buildingFilter, buildingLookup, modIndex.mods],
  )
  const activeBuildingModSources = useMemo(
    () =>
      findModSources({
        mods: modIndex.mods,
        selectReferences: (group: ModAssetIndexGroup) => group.buildings,
        key: activeBuildingId,
      }),
    [activeBuildingId, modIndex.mods],
  )
  const activeModBuildingEntry = useMemo(
    () => findModBrowserEntry(modBuildingGroups, activeModBuildingSelectionId),
    [activeModBuildingSelectionId, modBuildingGroups],
  )
  const activeBuilding = useActiveBuildingFallback(
    activeBuildingId,
    buildingEntries,
    filteredConstructibleGroups,
    filteredWorldBuildings,
    constructibleGroups,
    worldBuildings,
  )
  const activeUpgradeChain = useMemo(
    () =>
      activeBuilding?.sourceKind === 'constructible'
        ? activeBuilding.upgradeChainKeys
            .map((key) => buildingEntries.find((building) => building.key === key) ?? null)
            .filter((entry): entry is BuildingWorkspaceEntry => entry != null)
        : activeBuilding
          ? [activeBuilding]
          : [],
    [activeBuilding, buildingEntries],
  )
  const activeTextureState =
    activeBuilding?.sourceKind === 'constructible' ? (activeChainTextureStates[activeBuilding.key] ?? null) : null
  const effectiveActiveTextureState = browserSourceMode === 'mod' ? (activeModTextureState ?? activeTextureState) : activeTextureState
  const mapDocumentsByAssetName = useMemo(
    () => new Map(mapDocuments.map((document) => [getMapAssetName(document), document] as const)),
    [mapDocuments],
  )
  const activeIndoorMapDocument =
    activeBuilding?.indoorMapAssetName ? (mapDocumentsByAssetName.get(activeBuilding.indoorMapAssetName) ?? null) : null
  const activeExteriorMapDocument =
    activeBuilding?.sourceKind === 'world' && activeBuilding.exteriorMapAssetName
      ? (mapDocumentsByAssetName.get(activeBuilding.exteriorMapAssetName) ?? null)
      : null
  const activeIndoorMapPath = activeIndoorMapDocument?.relativePath ?? activeBuilding?.indoorMapPathLabel ?? null
  const activeIndoorMapMessage = activeIndoorMapDocument
    ? activeIndoorMapDocument.relativePath
    : activeBuilding?.sourceKind === 'world'
      ? (activeBuilding?.indoorMapPathLabel ?? copy.noIndoorMap)
      : (activeBuilding?.indoorMapAssetName ? activeBuilding.indoorMapPathLabel : activeBuilding?.nonInstancedIndoorLocation ?? copy.noIndoorMap)
  const activeExteriorMapPath = activeExteriorMapDocument?.relativePath ?? activeBuilding?.exteriorMapPathLabel ?? null
  const activeExteriorMapMessage = activeExteriorMapDocument?.relativePath ?? activeBuilding?.exteriorMapPathLabel ?? copy.noExteriorMap
  const activeExteriorFocusPoint = useMemo<ViewportWorldPoint | null>(() => {
    if (!activeExteriorMapDocument || !activeBuilding?.exteriorEntryTile) {
      return null
    }

    return {
      worldX: (activeBuilding.exteriorEntryTile.X + 0.5) * activeExteriorMapDocument.tileWidth,
      worldY: (activeBuilding.exteriorEntryTile.Y + 0.5) * activeExteriorMapDocument.tileHeight,
    }
  }, [activeBuilding?.exteriorEntryTile, activeExteriorMapDocument])

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      return deferToTimeout(() => {
        setBuildingEntries([])
        setConstructibleGroups([])
        setWorldBuildings([])
        setMapDocuments([])
        setActiveBuildingId(null)
        setBuildingStatusMessage('')
        setActiveChainTextureStates({})
        setActiveModTextureState(null)
        setSpringObjectsState({
          path: null,
          url: null,
          width: null,
          height: null,
        })
      })
    }

    let cancelled = false

    void (async () => {
      try {
        const [buildingsAsset, objectsAsset, locationsAsset, mapAssets] = await Promise.all([
          loadTextAsset(directoryInfo.rootPath, BUILDINGS_DATA_ASSET_PATH, locale),
          loadTextAsset(directoryInfo.rootPath, OBJECT_DATA_ASSET_PATH, locale).catch(() => null),
          loadTextAsset(directoryInfo.rootPath, LOCATIONS_DATA_ASSET_PATH, locale).catch(() => null),
          scanMaps(directoryInfo.rootPath, locale).catch(() => []),
        ])
        if (cancelled) {
          return
        }

        const localizedConstructibleEntries = await localizeBuildingEntries(
          createBuildingEntryIndex(buildingsAsset.content),
          directoryInfo.rootPath,
          locale,
        )
        const hydratedConstructibleEntries = objectsAsset
          ? hydrateBuildingMaterials(localizedConstructibleEntries, await buildObjectDisplayIndex(directoryInfo.rootPath, locale, objectsAsset.content))
          : localizedConstructibleEntries
        const loadedMapDocuments = (
          await runWithConcurrency(
            mapAssets.filter((asset) => asset.format === 'xnb'),
            8,
            async (asset) => {
              try {
                const loadedAsset = await loadMapAsset(directoryInfo.rootPath, asset.absolutePath, locale)
                if (loadedAsset.format !== 'xnb') {
                  return null
                }

                return JSON.parse(loadedAsset.content) as MapDocument
              } catch {
                return null
              }
            },
          )
        ).filter((document): document is MapDocument => document != null)
        const locationSeeds = buildLocationSeeds(locationsAsset?.content ?? null)
        const nextWorldBuildings = buildWorldBuildingEntries(loadedMapDocuments, locationSeeds)
        const nextConstructibleGroups = createConstructibleBuildingGroups(hydratedConstructibleEntries)
        const nextEntries = [...hydratedConstructibleEntries, ...nextWorldBuildings]
        if (cancelled) {
          return
        }

        setMapDocuments(loadedMapDocuments)
        setWorldBuildings(nextWorldBuildings)
        setConstructibleGroups(nextConstructibleGroups)
        setBuildingEntries(nextEntries)
        setActiveBuildingId((current) =>
          current && nextEntries.some((entry) => entry.key === current)
            ? current
            : nextConstructibleGroups[0]?.rootEntry.key ?? nextWorldBuildings[0]?.key ?? null,
        )
        setBuildingStatusMessage(
          nextConstructibleGroups.length || nextWorldBuildings.length
            ? copy.indexedStatusTemplate.replace('{count}', String(nextConstructibleGroups.length + nextWorldBuildings.length))
            : copy.noEntriesStatus,
        )
      } catch (error) {
        if (!cancelled) {
          setBuildingEntries([])
          setConstructibleGroups([])
          setWorldBuildings([])
          setMapDocuments([])
          setActiveBuildingId(null)
          setBuildingStatusMessage(error instanceof Error ? error.message : String(error))
          setActiveModTextureState(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [copy.indexedStatusTemplate, copy.noEntriesStatus, directoryInfo?.rootPath, locale])

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      return deferToTimeout(() => {
        setSpringObjectsState({
          path: null,
          url: null,
          width: null,
          height: null,
        })
      })
    }

    let cancelled = false
    const springObjectsPath = buildGameContentPath(directoryInfo.rootPath, SPRING_OBJECTS_ASSET_PATH)

    void loadImageState(springObjectsPath, locale)
      .then((state) => {
        if (!cancelled) {
          setSpringObjectsState(state)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSpringObjectsState({
            path: springObjectsPath,
            url: null,
            width: null,
            height: null,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [directoryInfo?.rootPath, locale])

  useEffect(() => {
    if (!directoryInfo?.rootPath || activeUpgradeChain.length === 0 || activeBuilding?.sourceKind !== 'constructible') {
      return deferToTimeout(() => {
        setActiveChainTextureStates({})
        setActiveModTextureState(null)
      })
    }

    let cancelled = false

    void (async () => {
      const entries = await loadChainTextureStates(activeUpgradeChain, directoryInfo.rootPath, locale)

      if (!cancelled) {
        setActiveChainTextureStates(entries)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeBuilding?.sourceKind, activeUpgradeChain, directoryInfo?.rootPath, locale])

  useEffect(() => {
    if (browserSourceMode !== 'mod') {
      return
    }

    const nextEntry =
      activeModBuildingEntry ??
      modBuildingGroups
        .flatMap((group) => group.items)
        .find((item) => item.value.key === activeBuildingId) ??
      modBuildingGroups[0]?.items[0] ??
      null

    if (nextEntry) {
      return deferToTimeout(() => {
        setActiveModBuildingSelectionId(nextEntry.selectionId)
        if (nextEntry.value.key !== activeBuildingId) {
          setActiveBuildingId(nextEntry.value.key)
        }
      })
    }
  }, [activeBuildingId, activeModBuildingEntry, browserSourceMode, modBuildingGroups])

  useEffect(() => {
    if (
      browserSourceMode !== 'mod' ||
      !directoryInfo?.rootPath ||
      !activeBuilding?.textureAssetName ||
      !activeModBuildingEntry
    ) {
      return deferToTimeout(() => {
        setActiveModTextureState(null)
      })
    }

    let cancelled = false
    void loadModResultImageState({
      rootPath: directoryInfo.rootPath,
      entry: activeModBuildingEntry,
      preferredTargets: [activeBuilding.textureAssetName],
      fallbackPathLabel: activeBuilding.texturePathLabel,
    })
      .then((result) => {
        if (!result || cancelled) {
          return
        }

        setActiveModTextureState({
          path: result.path,
          url: result.url,
          width: result.width,
          height: result.height,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setActiveModTextureState(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeBuilding?.textureAssetName, activeBuilding?.texturePathLabel, activeModBuildingEntry, browserSourceMode, directoryInfo?.rootPath])

  function handleSetBrowserSourceMode(mode: BrowserSourceMode) {
    setBrowserSourceMode(mode)
    if (mode !== 'mod') {
      setActiveModBuildingSelectionId(null)
      setActiveModTextureState(null)
    }
  }

  function handleSelectBuilding(buildingKey: string) {
    setActiveBuildingId(buildingKey)
  }

  function handleSelectModBuilding(entry: ModBrowserEntry<BuildingWorkspaceEntry>) {
    setActiveModBuildingSelectionId(entry.selectionId)
    setActiveBuildingId(entry.value.key)
  }

  return {
    buildingEntries,
    constructibleGroups,
    filteredConstructibleGroups,
    worldBuildings,
    filteredWorldBuildings,
    browserSourceMode,
    setBrowserSourceMode: handleSetBrowserSourceMode,
    modBuildingGroups,
    activeModBuildingSelectionId,
    activeBuildingModSources,
    buildingFilter,
    setBuildingFilter,
    activeBuildingId: activeBuilding?.key ?? null,
    activeBuilding,
    activeUpgradeChain,
    buildingStatusMessage,
    activeTextureState: effectiveActiveTextureState,
    activeChainTextureStates,
    activeIndoorMapDocument,
    activeIndoorMapPath,
    activeIndoorMapMessage,
    activeExteriorMapDocument,
    activeExteriorMapPath,
    activeExteriorMapMessage,
    activeExteriorFocusPoint,
    springObjectsState,
    handleSelectBuilding,
    handleSelectModBuilding,
  }
}
