/**
 * Character browser state: selection, filtering, source switching and the
 * asset-loading effects that follow them.
 *
 * All domain knowledge — the `Data/Characters` index shape, gift-taste
 * resolution, localized display names, appearance variants and the vanilla
 * asset cache — lives in `@entities/character` and is shared with the character
 * authoring page. This hook only turns it into browser presentation state.
 */

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { deferToAnimationFrame, deferToTimeout } from '@shared/lib/react'
import type { GameDirectoryInfo } from '@entities/game/api'
import type { CharactersPanelCopy, LocaleCode } from '@locales'
import {
  type CharacterAppearanceVariant,
  type CharacterVisualAssetState,
  type CharacterWorkspaceEntry,
  loadCharacterImageState,
  loadCharacterWorkspaceEntries,
  mergeCharacterAppearanceOverride,
  resolveCharacterVariantPaths,
  SPRING_OBJECTS_ASSET_PATH,
} from '@entities/character'
import {
  type BrowserSourceMode,
  buildModBrowserGroups,
  buildModEntryLookup,
  findModBrowserEntry,
  findModSources,
  type ModBrowserEntry,
} from '@pages/workbench/workspaces/mod'
import { useModAssetIndex } from '@pages/workbench/workspaces/mod'
import { loadModResultImageState, loadModResultJsonValue } from '@pages/workbench/workspaces/mod'
import { createCharacterEntryIndex } from '@entities/character'

type UseCharacterWorkspaceOptions = {
  directoryInfo: GameDirectoryInfo | null
  locale: LocaleCode
  copy: CharactersPanelCopy
  enableVisualAssets?: boolean
}

export function useCharacterWorkspace({ directoryInfo, locale, copy, enableVisualAssets = true }: UseCharacterWorkspaceOptions) {
  const [characters, setCharacters] = useState<CharacterWorkspaceEntry[]>([])
  const [modCharacterOverride, setModCharacterOverride] = useState<CharacterWorkspaceEntry | null>(null)
  const [characterFilter, setCharacterFilter] = useState('')
  const [browserSourceMode, setBrowserSourceMode] = useState<BrowserSourceMode>('original')
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null)
  const [activeModCharacterSelectionId, setActiveModCharacterSelectionId] = useState<string | null>(null)
  const [activeVariantKey, setActiveVariantKey] = useState<string>('default')
  const [characterStatusMessage, setCharacterStatusMessage] = useState('')
  const [assetState, setAssetState] = useState<CharacterVisualAssetState>({
    spritePath: null,
    portraitPath: null,
    spriteUrl: null,
    portraitUrl: null,
    springObjectsPath: null,
    springObjectsUrl: null,
    spriteSheetWidth: null,
    spriteSheetHeight: null,
    portraitSheetWidth: null,
    portraitSheetHeight: null,
    portraitOriginalWidth: null,
    portraitOriginalHeight: null,
    springObjectsSheetWidth: null,
    springObjectsSheetHeight: null,
  })
  const [assetLoading, setAssetLoading] = useState(false)
  const { modIndex } = useModAssetIndex(directoryInfo)

  const deferredFilter = useDeferredValue(characterFilter.trim().toLowerCase())
  const filteredCharacters = useMemo(
    () => characters.filter((character) => !deferredFilter || character.searchText.includes(deferredFilter)),
    [characters, deferredFilter],
  )
  const characterLookup = useMemo(() => buildModEntryLookup(characters, (character) => character.key), [characters])
  const modCharacterGroups = useMemo(
    () =>
      buildModBrowserGroups({
        mods: modIndex.mods,
        selectReferences: (group) => group.characters,
        entryLookup: characterLookup,
        filterText: characterFilter,
        getSearchText: (character) => character.searchText,
        getFallbackLabel: (character) => character.displayName,
      }),
    [characterFilter, characterLookup, modIndex.mods],
  )
  const activeCharacterModSources = useMemo(
    () =>
      findModSources({
        mods: modIndex.mods,
        selectReferences: (group) => group.characters,
        key: activeCharacterId,
      }),
    [activeCharacterId, modIndex.mods],
  )
  const activeModCharacterEntry = useMemo(
    () => findModBrowserEntry(modCharacterGroups, activeModCharacterSelectionId),
    [activeModCharacterSelectionId, modCharacterGroups],
  )
  const baseActiveCharacter =
    characters.find((character) => character.key === activeCharacterId) ?? filteredCharacters[0] ?? characters[0] ?? null
  const activeCharacter = modCharacterOverride?.key === baseActiveCharacter?.key ? modCharacterOverride : baseActiveCharacter
  const activeVariant =
    activeCharacter?.variants.find((variant) => variant.key === activeVariantKey) ?? activeCharacter?.variants[0] ?? null

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      return deferToTimeout(() => {
        setCharacters([])
        setModCharacterOverride(null)
        setActiveCharacterId(null)
        setActiveVariantKey('default')
        setCharacterStatusMessage('')
        setAssetState({
          spritePath: null,
          portraitPath: null,
          spriteUrl: null,
          portraitUrl: null,
          springObjectsPath: null,
          springObjectsUrl: null,
          spriteSheetWidth: null,
          spriteSheetHeight: null,
          portraitSheetWidth: null,
          portraitSheetHeight: null,
          portraitOriginalWidth: null,
          portraitOriginalHeight: null,
          springObjectsSheetWidth: null,
          springObjectsSheetHeight: null,
        })
      })
    }

    let cancelled = false

    void (async () => {
      try {
        const hydratedCharacters = await loadCharacterWorkspaceEntries(directoryInfo.rootPath, locale)
        if (cancelled) {
          return
        }

        setCharacters(hydratedCharacters)
        setActiveCharacterId((current) =>
          current && hydratedCharacters.some((character) => character.key === current) ? current : (hydratedCharacters[0]?.key ?? null),
        )
        setCharacterStatusMessage(
          hydratedCharacters.length
            ? copy.indexedStatusTemplate.replace('{count}', String(hydratedCharacters.length))
            : copy.noEntriesStatus,
        )
      } catch (error) {
        if (!cancelled) {
          setCharacters([])
          setModCharacterOverride(null)
          setActiveCharacterId(null)
          setCharacterStatusMessage(error instanceof Error ? error.message : String(error))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [copy.indexedStatusTemplate, copy.noEntriesStatus, directoryInfo?.rootPath, locale])

  useEffect(() => {
    if (browserSourceMode !== 'mod' || !directoryInfo?.rootPath || !activeModCharacterEntry || !baseActiveCharacter) {
      return deferToAnimationFrame(() => {
        setModCharacterOverride(null)
      })
    }

    let cancelled = false

    const cancel = deferToAnimationFrame(() => {
      void (async () => {
        try {
          const modContent = await loadModResultJsonValue({
            rootPath: directoryInfo.rootPath,
            entry: activeModCharacterEntry,
            preferredTargets: ['Data/Characters'],
          })

          if (cancelled) {
            return
          }

          if (!modContent || typeof modContent !== 'object' || Array.isArray(modContent)) {
            setModCharacterOverride(null)
            return
          }

          const overrideCharacter =
            createCharacterEntryIndex(JSON.stringify(modContent)).find((character) => character.key === baseActiveCharacter.key) ?? null
          setModCharacterOverride(overrideCharacter ? mergeCharacterAppearanceOverride(baseActiveCharacter, overrideCharacter) : null)
        } catch {
          if (!cancelled) {
            setModCharacterOverride(null)
          }
        }
      })()
    })

    return () => {
      cancelled = true
      cancel()
    }
  }, [activeModCharacterEntry, baseActiveCharacter, browserSourceMode, directoryInfo?.rootPath])

  useEffect(() => {
    return deferToAnimationFrame(() => {
      if (!activeCharacter) {
        setActiveVariantKey('default')
        return
      }

      setActiveVariantKey((current) =>
        activeCharacter.variants.some((variant) => variant.key === current) ? current : (activeCharacter.variants[0]?.key ?? 'default'),
      )
    })
  }, [activeCharacter])

  useEffect(() => {
    if (browserSourceMode !== 'mod') {
      return
    }

    return deferToAnimationFrame(() => {
      const nextEntry =
        activeModCharacterEntry ??
        modCharacterGroups.flatMap((group) => group.items).find((item) => item.value.key === activeCharacterId) ??
        modCharacterGroups[0]?.items[0] ??
        null

      if (!nextEntry) {
        return
      }

      setActiveModCharacterSelectionId(nextEntry.selectionId)
      if (nextEntry.value.key !== activeCharacterId) {
        setActiveCharacterId(nextEntry.value.key)
      }
    })
  }, [activeCharacterId, activeModCharacterEntry, browserSourceMode, modCharacterGroups])

  useEffect(() => {
    let cancelled = false
    const cancel = deferToAnimationFrame(() => {
      const { spritePath, portraitPath } = resolveCharacterVariantPaths(directoryInfo?.rootPath ?? null, activeVariant)
      const springObjectsPath = directoryInfo?.rootPath ? `${directoryInfo.rootPath}\\${SPRING_OBJECTS_ASSET_PATH}` : null

      setAssetLoading(true)

      if (!enableVisualAssets) {
        setAssetState({
          spritePath,
          portraitPath,
          spriteUrl: null,
          portraitUrl: null,
          springObjectsPath,
          springObjectsUrl: null,
          spriteSheetWidth: null,
          spriteSheetHeight: null,
          portraitSheetWidth: null,
          portraitSheetHeight: null,
          portraitOriginalWidth: null,
          portraitOriginalHeight: null,
          springObjectsSheetWidth: null,
          springObjectsSheetHeight: null,
        })
        setAssetLoading(false)
        return
      }

      if (!spritePath && !portraitPath && !springObjectsPath) {
        setAssetState({
          spritePath: null,
          portraitPath: null,
          spriteUrl: null,
          portraitUrl: null,
          springObjectsPath: null,
          springObjectsUrl: null,
          spriteSheetWidth: null,
          spriteSheetHeight: null,
          portraitSheetWidth: null,
          portraitSheetHeight: null,
          portraitOriginalWidth: null,
          portraitOriginalHeight: null,
          springObjectsSheetWidth: null,
          springObjectsSheetHeight: null,
        })
        setAssetLoading(false)
        return
      }

      void (async () => {
        try {
          const [sprite, portrait, springObjects] = await Promise.all([
            browserSourceMode === 'mod' && directoryInfo?.rootPath && activeModCharacterEntry
              ? loadModResultImageState({
                  rootPath: directoryInfo.rootPath,
                  entry: activeModCharacterEntry,
                  preferredTargets: [activeVariant?.spriteAssetName ?? activeCharacter?.spriteAssetName ?? ''],
                  fallbackPathLabel: activeVariant?.spritePathLabel ?? activeCharacter?.internalName ?? 'Characters\\Unknown',
                })
                  .then((result) => result ?? loadCharacterImageState(spritePath, locale))
                  .catch(() => ({ path: spritePath, url: null, width: null, height: null, originalWidth: null, originalHeight: null }))
              : loadCharacterImageState(spritePath, locale).catch(() => ({
                  path: spritePath,
                  url: null,
                  width: null,
                  height: null,
                  originalWidth: null,
                  originalHeight: null,
                })),
            browserSourceMode === 'mod' && directoryInfo?.rootPath && activeModCharacterEntry
              ? loadModResultImageState({
                  rootPath: directoryInfo.rootPath,
                  entry: activeModCharacterEntry,
                  preferredTargets: [activeVariant?.portraitAssetName ?? activeCharacter?.portraitAssetName ?? ''],
                  fallbackPathLabel: activeVariant?.portraitPathLabel ?? activeCharacter?.internalName ?? 'Portraits\\Unknown',
                })
                  .then((result) => result ?? loadCharacterImageState(portraitPath, locale))
                  .catch(() => ({ path: portraitPath, url: null, width: null, height: null, originalWidth: null, originalHeight: null }))
              : loadCharacterImageState(portraitPath, locale).catch(() => ({
                  path: portraitPath,
                  url: null,
                  width: null,
                  height: null,
                  originalWidth: null,
                  originalHeight: null,
                })),
            loadCharacterImageState(springObjectsPath, locale).catch(() => ({
              path: springObjectsPath,
              url: null,
              width: null,
              height: null,
              originalWidth: null,
              originalHeight: null,
            })),
          ])

          if (cancelled) {
            return
          }

          setAssetState({
            spritePath: sprite.path,
            portraitPath: portrait.path,
            spriteUrl: sprite.url,
            portraitUrl: portrait.url,
            springObjectsPath: springObjects.path,
            springObjectsUrl: springObjects.url,
            spriteSheetWidth: sprite.width,
            spriteSheetHeight: sprite.height,
            portraitSheetWidth: portrait.width,
            portraitSheetHeight: portrait.height,
            portraitOriginalWidth: portrait.originalWidth ?? null,
            portraitOriginalHeight: portrait.originalHeight ?? null,
            springObjectsSheetWidth: springObjects.width,
            springObjectsSheetHeight: springObjects.height,
          })
          setAssetLoading(false)
        } catch {
          if (!cancelled) {
            setAssetState({
              spritePath,
              portraitPath,
              spriteUrl: null,
              portraitUrl: null,
              springObjectsPath,
              springObjectsUrl: null,
              spriteSheetWidth: null,
              spriteSheetHeight: null,
              portraitSheetWidth: null,
              portraitSheetHeight: null,
              portraitOriginalWidth: null,
              portraitOriginalHeight: null,
              springObjectsSheetWidth: null,
              springObjectsSheetHeight: null,
            })
            setAssetLoading(false)
          }
        }
      })()
    })

    return () => {
      cancelled = true
      cancel()
    }
  }, [
    activeCharacter?.internalName,
    activeCharacter?.portraitAssetName,
    activeCharacter?.spriteAssetName,
    activeModCharacterEntry,
    activeVariant,
    browserSourceMode,
    directoryInfo?.rootPath,
    enableVisualAssets,
    locale,
  ])

  function handleSetBrowserSourceMode(mode: BrowserSourceMode) {
    setBrowserSourceMode(mode)
    if (mode !== 'mod') {
      setActiveModCharacterSelectionId(null)
    }
  }

  function handleSelectCharacter(characterKey: string) {
    setActiveCharacterId(characterKey)
  }

  function handleSelectModCharacter(entry: ModBrowserEntry<CharacterWorkspaceEntry>) {
    setActiveModCharacterSelectionId(entry.selectionId)
    setActiveCharacterId(entry.value.key)
  }

  function handleSelectVariant(variant: CharacterAppearanceVariant) {
    setActiveVariantKey(variant.key)
  }

  return {
    characters,
    filteredCharacters,
    browserSourceMode,
    setBrowserSourceMode: handleSetBrowserSourceMode,
    modCharacterGroups,
    activeModCharacterSelectionId,
    activeCharacterModSources,
    characterFilter,
    setCharacterFilter,
    activeCharacterId: activeCharacter?.key ?? null,
    activeCharacter,
    activeVariant,
    characterStatusMessage,
    assetState,
    assetLoading,
    handleSelectCharacter,
    handleSelectModCharacter,
    handleSelectVariant,
  }
}
