import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { GameDirectoryInfo } from '@entities/game/api'
import type { ItemsPanelCopy, LocaleCode } from '@locales'
import {
  createItemEntryLookup,
  itemMatchesFilter,
  loadItemTextureAssetState,
  loadItemWorkspaceEntries,
  type ItemTextureAssetState,
  type ItemWorkspaceEntry,
} from '../entities/item'
import {
  type BrowserSourceMode,
  buildModBrowserGroups,
  buildModEntryLookup,
  findModBrowserEntry,
  findModSources,
  type ModBrowserEntry,
} from '@pages/workbench/workspaces/mod'
import { useModAssetIndex } from '@pages/workbench/workspaces/mod'
import { loadModResultImageState } from '@pages/workbench/workspaces/mod'
import { scheduleDeferred } from '@shared/lib/react'

type UseItemWorkspaceOptions = {
  directoryInfo: GameDirectoryInfo | null
  locale: LocaleCode
  copy: ItemsPanelCopy
}

export function useItemWorkspace({ directoryInfo, locale, copy }: UseItemWorkspaceOptions) {
  const [items, setItems] = useState<ItemWorkspaceEntry[]>([])
  const [itemFilter, setItemFilter] = useState('')
  const [browserSourceMode, setBrowserSourceMode] = useState<BrowserSourceMode>('original')
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [itemStatusMessage, setItemStatusMessage] = useState('')
  const [textureStatesByAssetName, setTextureStatesByAssetName] = useState<Record<string, ItemTextureAssetState>>({})
  const [modTextureStatesByAssetName, setModTextureStatesByAssetName] = useState<Record<string, ItemTextureAssetState>>({})
  const [activeModItemSelectionId, setActiveModItemSelectionId] = useState<string | null>(null)
  const { modIndex } = useModAssetIndex(directoryInfo)
  const rootPath = directoryInfo?.rootPath ?? null
  const workspaceSignatureRef = useRef({ rootPath, locale })

  useEffect(() => {
    workspaceSignatureRef.current = { rootPath, locale }
  }, [locale, rootPath])

  const deferredFilter = useDeferredValue(itemFilter.trim().toLowerCase())
  const filteredItems = useMemo(() => items.filter((item) => itemMatchesFilter(item, deferredFilter)), [deferredFilter, items])
  const itemLookupByKey = useMemo(() => buildModEntryLookup(items, (item) => item.key), [items])
  const modItemGroups = useMemo(
    () =>
      buildModBrowserGroups({
        mods: modIndex.mods,
        selectReferences: (group) => group.items,
        entryLookup: itemLookupByKey,
        filterText: itemFilter,
        getSearchText: (item) => item.searchText,
        getFallbackLabel: (item) => item.displayName,
      }),
    [itemFilter, itemLookupByKey, modIndex.mods],
  )
  const activeItemModSources = useMemo(
    () =>
      findModSources({
        mods: modIndex.mods,
        selectReferences: (group) => group.items,
        key: activeItemId,
      }),
    [activeItemId, modIndex.mods],
  )
  const activeModItemEntry = useMemo(
    () => findModBrowserEntry(modItemGroups, activeModItemSelectionId),
    [activeModItemSelectionId, modItemGroups],
  )
  const activeItem = items.find((item) => item.key === activeItemId) ?? filteredItems[0] ?? items[0] ?? null
  const itemLookup = useMemo(() => createItemEntryLookup(items), [items])
  const effectiveTextureStatesByAssetName = useMemo(
    () => (browserSourceMode === 'mod' ? { ...textureStatesByAssetName, ...modTextureStatesByAssetName } : textureStatesByAssetName),
    [browserSourceMode, modTextureStatesByAssetName, textureStatesByAssetName],
  )

  useEffect(() => {
    if (!rootPath) {
      return scheduleDeferred(() => {
        setItems([])
        setActiveItemId(null)
        setItemStatusMessage('')
        setTextureStatesByAssetName({})
        setModTextureStatesByAssetName({})
      })
    }

    let cancelled = false

    void (async () => {
      try {
        setTextureStatesByAssetName({})
        setModTextureStatesByAssetName({})
        const giftHydratedEntries = await loadItemWorkspaceEntries(rootPath, locale)
        if (cancelled) {
          return
        }

        setItems(giftHydratedEntries)
        setActiveItemId((current) =>
          current && giftHydratedEntries.some((entry) => entry.key === current) ? current : (giftHydratedEntries[0]?.key ?? null),
        )
        setItemStatusMessage(
          giftHydratedEntries.length
            ? copy.indexedStatusTemplate.replace('{count}', String(giftHydratedEntries.length))
            : copy.noEntriesStatus,
        )
      } catch (error) {
        if (!cancelled) {
          setItems([])
          setActiveItemId(null)
          setTextureStatesByAssetName({})
          setModTextureStatesByAssetName({})
          setItemStatusMessage(error instanceof Error ? error.message : String(error))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [copy.indexedStatusTemplate, copy.noEntriesStatus, rootPath, locale])

  const ensureTextureAssetStates = useCallback(
    (assetNames: string[]) => {
      if (!rootPath) {
        return
      }

      const normalizedAssetNames = Array.from(new Set(assetNames.map((assetName) => assetName.trim()).filter(Boolean)))
      const pendingAssetNames = normalizedAssetNames.filter((assetName) => !(assetName in textureStatesByAssetName))
      if (pendingAssetNames.length === 0) {
        return
      }

      setTextureStatesByAssetName((current) => ({
        ...current,
        ...Object.fromEntries(
          pendingAssetNames.map((assetName) => [
            assetName,
            {
              path: null,
              url: null,
              width: null,
              height: null,
              loading: true,
            } satisfies ItemTextureAssetState,
          ]),
        ),
      }))

      void (async () => {
        const requestRootPath = rootPath
        const requestLocale = locale
        const entries = await Promise.all(
          pendingAssetNames.map(async (assetName) => {
            return [assetName, await loadItemTextureAssetState(requestRootPath, assetName, requestLocale)] as const
          }),
        )

        const currentSignature = workspaceSignatureRef.current
        if (currentSignature.rootPath !== requestRootPath || currentSignature.locale !== requestLocale) {
          return
        }

        setTextureStatesByAssetName((current) => ({
          ...current,
          ...Object.fromEntries(
            entries.filter(([assetName]) => {
              const currentState = current[assetName]
              // Replace placeholder loading states and fill missing entries,
              // but never overwrite an already-resolved state from a newer load.
              return !currentState || currentState.loading === true
            }),
          ),
        }))
      })()
    },
    [locale, rootPath, textureStatesByAssetName],
  )

  useEffect(() => {
    if (!activeItem?.textureAssetName) {
      return
    }

    ensureTextureAssetStates([activeItem.textureAssetName])
  }, [activeItem?.textureAssetName, ensureTextureAssetStates])

  useEffect(() => {
    if (browserSourceMode !== 'mod' || !rootPath || !activeItem?.textureAssetName || !activeModItemEntry) {
      return
    }

    let cancelled = false
    const textureAssetName = activeItem.textureAssetName

    setModTextureStatesByAssetName((current) => ({
      ...current,
      [textureAssetName]: {
        path: null,
        url: null,
        width: null,
        height: null,
        loading: true,
      } satisfies ItemTextureAssetState,
    }))

    void loadModResultImageState({
      rootPath,
      entry: activeModItemEntry,
      preferredTargets: [textureAssetName],
      fallbackPathLabel: activeItem.texturePathLabel,
    })
      .then((result) => {
        if (!result || cancelled) {
          return
        }

        setModTextureStatesByAssetName((current) => ({
          ...current,
          [textureAssetName]: {
            path: result.path,
            url: result.url,
            width: result.width,
            height: result.height,
            loading: false,
          },
        }))
      })
      .catch(() => {
        if (!cancelled) {
          setModTextureStatesByAssetName((current) => ({
            ...current,
            [textureAssetName]: {
              path: null,
              url: null,
              width: null,
              height: null,
              loading: false,
            },
          }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeItem?.textureAssetName, activeItem?.texturePathLabel, activeModItemEntry, browserSourceMode, rootPath])

  useEffect(() => {
    if (browserSourceMode !== 'mod') {
      return
    }

    const nextEntry =
      activeModItemEntry ??
      modItemGroups.flatMap((group) => group.items).find((item) => item.value.key === activeItemId) ??
      modItemGroups[0]?.items[0] ??
      null

    if (!nextEntry) {
      return
    }

    return scheduleDeferred(() => {
      setActiveModItemSelectionId(nextEntry.selectionId)
      if (nextEntry.value.key !== activeItemId) {
        setActiveItemId(nextEntry.value.key)
      }
    })
  }, [activeItemId, activeModItemEntry, browserSourceMode, modItemGroups])

  function handleSetBrowserSourceMode(mode: BrowserSourceMode) {
    setBrowserSourceMode(mode)
    if (mode !== 'mod') {
      setActiveModItemSelectionId(null)
      setModTextureStatesByAssetName({})
    }
  }

  function handleSelectItem(itemKey: string) {
    setActiveItemId(itemKey)
  }

  function handleSelectModItem(entry: ModBrowserEntry<ItemWorkspaceEntry>) {
    setActiveModItemSelectionId(entry.selectionId)
    setActiveItemId(entry.value.key)
  }

  return {
    items,
    filteredItems,
    browserSourceMode,
    setBrowserSourceMode: handleSetBrowserSourceMode,
    modItemGroups,
    activeModItemSelectionId,
    activeItemModSources,
    itemFilter,
    setItemFilter,
    activeItemId: activeItem?.key ?? null,
    activeItem,
    itemLookup,
    itemStatusMessage,
    textureStatesByAssetName: effectiveTextureStatesByAssetName,
    ensureTextureAssetStates,
    handleSelectItem,
    handleSelectModItem,
  }
}
