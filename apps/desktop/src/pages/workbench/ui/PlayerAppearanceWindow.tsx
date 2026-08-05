import { ChevronLeft, ChevronRight, CopyPlus, FolderOpen, Plus, Trash2, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { buildGameContentPath } from '@shared/infra/stardew-assets/contentPaths'
import { useEventStageCopy, useLocale } from '@locales/provider'
import { loadTextFile, scanDefaultSaveSlots, type DefaultSaveSlotSummary } from '@entities/game/api'
import { loadImageResourceFromPath } from '@shared/lib/assets'
import {
  colorToHex,
  hexToColor,
  parsePlayerAppearanceProfileFromSave,
  type PlayerAppearanceColor,
  type PlayerAppearanceProfile,
} from '@entities/event'
import {
  bakeFarmerBaseTexture,
  bakeFarmerHairTexture,
  bakeFarmerPantsTexture,
  bakeFarmerShirtTexture,
  getFarmerBaseAsset,
  getFarmerFeatureXOffset,
  getFarmerFeatureYOffset,
  getFarmerHairYOffsetAdjustment,
} from '@entities/event'
import {
  getClothingPantsCount,
  getClothingPantsVariantSourceRect,
  getClothingShirtCount,
  getClothingShirtMenuSourceRect,
} from '@entities/character/lib/clothingSprites'
import { cx } from '@shared/lib/helper'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'

type PlayerAppearanceWindowProps = {
  open: boolean
  rootPath: string | null
  profiles: PlayerAppearanceProfile[]
  activeProfileId: string | null
  onSelectProfile: (profileId: string) => void
  onCreateProfile: () => void
  onDuplicateProfile: () => void
  onDeleteProfile: () => void
  onImportProfile: (profile: PlayerAppearanceProfile) => void
  onChangeProfile: (profile: PlayerAppearanceProfile) => void
  onClose: () => void
}

type LoadedImage = {
  image: HTMLImageElement
  url: string
  width: number
  height: number
}

type AppearanceAssets = {
  baseMale: LoadedImage | null
  baseFemale: LoadedImage | null
  hair: LoadedImage | null
  shirts: LoadedImage | null
  pants: LoadedImage | null
  accessories: LoadedImage | null
  hats: LoadedImage | null
  skinColors: LoadedImage | null
  shoeColors: LoadedImage | null
}

type AppearanceSection = 'body' | 'hair' | 'shirt' | 'pants' | 'accessory' | 'hat'

type PreviewLayer = {
  key: string
  url: string
  width: number
  height: number
  offsetX: number
  offsetY: number
  sourceX: number
  sourceY: number
  flip?: boolean
}

const OPTION_PAGE_SIZE = 18
const SKIN_TONE_OPTIONS = 24
const SHOE_COLOR_OPTIONS = 8
const EMPTY_APPEARANCE_ASSETS: AppearanceAssets = {
  baseMale: null,
  baseFemale: null,
  hair: null,
  shirts: null,
  pants: null,
  accessories: null,
  hats: null,
  skinColors: null,
  shoeColors: null,
}

function buildCharactersPath(rootPath: string, textureName: string) {
  return `${rootPath}\\Content\\Characters\\${textureName}.xnb`
}

function preloadImage(path: string) {
  return loadImageResourceFromPath(path)
}

function preloadContentImage(rootPath: string, textureName: string) {
  return preloadImage(buildGameContentPath(rootPath, textureName)!)
}

async function loadAppearanceAssets(rootPath: string): Promise<AppearanceAssets> {
  const [baseMale, baseFemale, hair, shirts, pants, accessories, hats, skinColors, shoeColors] = await Promise.all([
    preloadImage(buildCharactersPath(rootPath, 'Farmer\\farmer_base')),
    preloadImage(buildCharactersPath(rootPath, 'Farmer\\farmer_girl_base')),
    preloadContentImage(rootPath, 'Characters/Farmer/hairstyles'),
    preloadContentImage(rootPath, 'Characters/Farmer/shirts'),
    preloadContentImage(rootPath, 'Characters/Farmer/pants'),
    preloadContentImage(rootPath, 'Characters/Farmer/accessories'),
    preloadContentImage(rootPath, 'Characters/Farmer/hats'),
    preloadContentImage(rootPath, 'Characters/Farmer/skinColors'),
    preloadContentImage(rootPath, 'Characters/Farmer/shoeColors'),
  ])

  return {
    baseMale,
    baseFemale,
    hair,
    shirts,
    pants,
    accessories,
    hats,
    skinColors,
    shoeColors,
  }
}

const paletteStopCache = new Map<string, string[]>()

function buildPaletteStops(asset: LoadedImage | null, rowIndex: number, stopCount: number) {
  if (!asset) {
    return [] as string[]
  }

  const cacheKey = `${asset.url}:${rowIndex}:${stopCount}`
  const cached = paletteStopCache.get(cacheKey)
  if (cached) {
    return cached
  }

  try {
    const y = Math.max(0, Math.min(asset.height - 1, rowIndex))
    const canvas = document.createElement('canvas')
    canvas.width = asset.width
    canvas.height = asset.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return [] as string[]
    }

    context.drawImage(asset.image, 0, 0)
    const colors = Array.from({ length: Math.min(stopCount, asset.width) }, (_, x) => {
      const pixel = context.getImageData(x, y, 1, 1).data
      return `rgba(${pixel[0] ?? 0}, ${pixel[1] ?? 0}, ${pixel[2] ?? 0}, ${((pixel[3] ?? 255) / 255).toFixed(4)})`
    })
    paletteStopCache.set(cacheKey, colors)
    return colors
  } catch (error) {
    console.warn('Failed to sample palette preview row.', error)
    return [] as string[]
  }
}

function buildPalettePrimaryColor(asset: LoadedImage | null, rowIndex: number, stopCount: number) {
  const stops = buildPaletteStops(asset, rowIndex, stopCount)
  return stops[stops.length - 1] ?? 'rgba(255,255,255,0.12)'
}

function buildPreviewLayers(profile: PlayerAppearanceProfile, assets: AppearanceAssets) {
  const baseAsset = getFarmerBaseAsset(profile, assets.baseMale, assets.baseFemale)
  if (!baseAsset) {
    return [] as PreviewLayer[]
  }
  const recoloredBaseUrl = bakeFarmerBaseTexture(profile, baseAsset, assets.shirts, assets.skinColors, assets.shoeColors) ?? baseAsset.url
  const bakedHairUrl = bakeFarmerHairTexture(profile, assets.hair)
  const bakedShirtUrl = bakeFarmerShirtTexture(profile, assets.shirts)
  const bakedPantsUrl = bakeFarmerPantsTexture(profile, assets.pants)

  const frame = 0
  const featureX = getFarmerFeatureXOffset(frame)
  const featureY = getFarmerFeatureYOffset(frame)

  const layers: PreviewLayer[] = [
    {
      key: 'base',
      url: recoloredBaseUrl,
      width: 16,
      height: 32,
      offsetX: 0,
      offsetY: 0,
      sourceX: 0,
      sourceY: 0,
    },
  ]

  if (assets.pants) {
    const pantsSourceRect = getClothingPantsVariantSourceRect(assets.pants.width, profile.pantsSpriteIndex, profile.isFemale)
    layers.push({
      key: 'pants',
      url: bakedPantsUrl ?? assets.pants.url,
      width: 16,
      height: 32,
      offsetX: 0,
      offsetY: 0,
      sourceX: bakedPantsUrl ? 0 : pantsSourceRect.x,
      sourceY: bakedPantsUrl ? 0 : pantsSourceRect.y,
    })
  }

  if (assets.shirts) {
    const shirtSourceRect = getClothingShirtMenuSourceRect(assets.shirts.width, profile.shirtSpriteIndex)
    layers.push({
      key: 'shirt',
      url: bakedShirtUrl ?? assets.shirts.url,
      width: 8,
      height: 8,
      offsetX: 4,
      offsetY: 14 + featureY,
      sourceX: bakedShirtUrl ? 0 : shirtSourceRect.x,
      sourceY: bakedShirtUrl ? 0 : shirtSourceRect.y,
    })
  }

  if (assets.hair) {
    layers.push({
      key: 'hair',
      url: bakedHairUrl ?? assets.hair.url,
      width: 16,
      height: 32,
      offsetX: featureX,
      offsetY: featureY + getFarmerHairYOffsetAdjustment(profile.isFemale, profile.hairStyleIndex),
      sourceX: bakedHairUrl ? 0 : (profile.hairStyleIndex * 16) % 128,
      sourceY: bakedHairUrl ? 0 : Math.floor((profile.hairStyleIndex * 16) / 128) * 96,
    })
  }

  if (assets.accessories && profile.accessoryIndex >= 0) {
    const sheetWidth = Math.max(16, assets.accessories.width)
    layers.push({
      key: 'accessory',
      url: assets.accessories.url,
      width: 16,
      height: 16,
      offsetX: 0,
      offsetY: 2,
      sourceX: (profile.accessoryIndex * 16) % sheetWidth,
      sourceY: Math.floor((profile.accessoryIndex * 16) / sheetWidth) * 32,
    })
  }

  if (assets.hats && profile.hatSpriteIndex != null) {
    const sheetWidth = Math.max(20, assets.hats.width)
    layers.push({
      key: 'hat',
      url: assets.hats.url,
      width: 20,
      height: 20,
      offsetX: -2,
      offsetY: -2,
      sourceX: (profile.hatSpriteIndex * 20) % sheetWidth,
      sourceY: Math.floor((profile.hatSpriteIndex * 20) / sheetWidth) * 80,
    })
  }

  layers.push({
    key: 'arms',
    url: recoloredBaseUrl,
    width: 16,
    height: 32,
    offsetX: 0,
    offsetY: 0,
    sourceX: 96,
    sourceY: 0,
  })

  return layers
}

function countFromAtlas(asset: LoadedImage | null, itemWidth: number, itemHeight: number) {
  if (!asset || itemWidth <= 0 || itemHeight <= 0) {
    return 0
  }

  return Math.max(0, Math.floor(asset.width / itemWidth) * Math.floor(asset.height / itemHeight))
}

function updateColor(profile: PlayerAppearanceProfile, key: 'hairColor' | 'eyeColor' | 'shirtColor' | 'pantsColor', nextHex: string) {
  return {
    ...profile,
    [key]: hexToColor(nextHex, profile[key] as PlayerAppearanceColor),
  }
}

function FarmerPreviewSprite({ profile, assets, scale }: { profile: PlayerAppearanceProfile; assets: AppearanceAssets; scale: number }) {
  const layers = buildPreviewLayers(profile, assets)

  if (layers.length === 0) {
    return <div className="appearance-preview-empty" />
  }

  return (
    <div className="appearance-preview-outer" style={{ width: `${24 * scale}px`, height: `${36 * scale}px` }}>
      <div className="appearance-preview-inner" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {layers.map((layer) => (
          <div
            key={layer.key}
            className="appearance-preview-layer"
            style={{
              left: `${4 + layer.offsetX}px`,
              top: `${2 + layer.offsetY}px`,
              width: `${layer.width}px`,
              height: `${layer.height}px`,
              transform: layer.flip ? `translateX(${layer.width}px) scaleX(-1)` : undefined,
              backgroundImage: `url("${layer.url}")`,
              backgroundPosition: `-${layer.sourceX}px -${layer.sourceY}px`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default function PlayerAppearanceWindow({
  open,
  rootPath,
  profiles,
  activeProfileId,
  onSelectProfile,
  onCreateProfile,
  onDuplicateProfile,
  onDeleteProfile,
  onImportProfile,
  onChangeProfile,
  onClose,
}: PlayerAppearanceWindowProps) {
  const locale = useLocale()
  const copy = useEventStageCopy().playerAppearance
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null
  const [activeSection, setActiveSection] = useState<AppearanceSection>('body')
  const [page, setPage] = useState(0)
  const [assets, setAssets] = useState<AppearanceAssets>(EMPTY_APPEARANCE_ASSETS)
  const [loadedRootPath, setLoadedRootPath] = useState<string | null>(null)
  const [saveBrowserOpen, setSaveBrowserOpen] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveLoadError, setSaveLoadError] = useState<string | null>(null)
  const [savePreviews, setSavePreviews] = useState<Array<{ summary: DefaultSaveSlotSummary; profile: PlayerAppearanceProfile }>>([])

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

  useEffect(() => {
    if (!open || !rootPath) {
      return
    }

    let cancelled = false

    void (async () => {
      const loaded = await loadAppearanceAssets(rootPath)
      if (cancelled) {
        return
      }

      setAssets(loaded)
      setLoadedRootPath(rootPath)
    })()

    return () => {
      cancelled = true
    }
  }, [open, rootPath])

  const loadingAssets = Boolean(rootPath) && loadedRootPath !== rootPath
  const previewAssets = !loadingAssets && loadedRootPath === rootPath ? assets : EMPTY_APPEARANCE_ASSETS

  const counts = useMemo(() => {
    return {
      hair: Math.max(countFromAtlas(previewAssets.hair, 16, 96), (activeProfile?.hairStyleIndex ?? -1) + 1),
      shirt: Math.max(
        previewAssets.shirts ? getClothingShirtCount(previewAssets.shirts.width, previewAssets.shirts.height) : 0,
        (activeProfile?.shirtSpriteIndex ?? -1) + 1,
      ),
      pants: Math.max(
        previewAssets.pants ? getClothingPantsCount(previewAssets.pants.width, previewAssets.pants.height) : 0,
        (activeProfile?.pantsSpriteIndex ?? -1) + 1,
      ),
      accessory: Math.max(countFromAtlas(previewAssets.accessories, 16, 32), (activeProfile?.accessoryIndex ?? -1) + 1),
      hat: Math.max(countFromAtlas(previewAssets.hats, 20, 80), (activeProfile?.hatSpriteIndex ?? -1) + 1),
    }
  }, [
    activeProfile?.accessoryIndex,
    activeProfile?.hairStyleIndex,
    activeProfile?.hatSpriteIndex,
    activeProfile?.pantsSpriteIndex,
    activeProfile?.shirtSpriteIndex,
    previewAssets.accessories,
    previewAssets.hair,
    previewAssets.hats,
    previewAssets.pants,
    previewAssets.shirts,
  ])

  const sectionItems = useMemo(() => {
    if (!activeProfile || activeSection === 'body') {
      return []
    }

    if (activeSection === 'hair') {
      return Array.from({ length: counts.hair }, (_, index) => ({
        id: `hair:${index}`,
        label: `#${index}`,
        active: activeProfile.hairStyleIndex === index,
        profile: { ...activeProfile, hairStyleIndex: index },
      }))
    }

    if (activeSection === 'shirt') {
      return Array.from({ length: counts.shirt }, (_, index) => ({
        id: `shirt:${index}`,
        label: `#${index}`,
        active: activeProfile.shirtSpriteIndex === index,
        profile: { ...activeProfile, shirtSpriteIndex: index },
      }))
    }

    if (activeSection === 'pants') {
      return Array.from({ length: counts.pants }, (_, index) => ({
        id: `pants:${index}`,
        label: `#${index}`,
        active: activeProfile.pantsSpriteIndex === index,
        profile: { ...activeProfile, pantsSpriteIndex: index },
      }))
    }

    if (activeSection === 'accessory') {
      return [
        {
          id: 'accessory:none',
          label: copy.none,
          active: activeProfile.accessoryIndex < 0,
          profile: { ...activeProfile, accessoryIndex: -1 },
        },
        ...Array.from({ length: counts.accessory }, (_, index) => ({
          id: `accessory:${index}`,
          label: `#${index}`,
          active: activeProfile.accessoryIndex === index,
          profile: { ...activeProfile, accessoryIndex: index },
        })),
      ]
    }

    return Array.from({ length: counts.hat }, (_, index) => ({
      id: `hat:${index}`,
      label: `#${index}`,
      active: activeProfile.hatSpriteIndex === index,
      profile: { ...activeProfile, hatSpriteIndex: index },
    }))
  }, [activeProfile, activeSection, copy.none, counts.accessory, counts.hair, counts.hat, counts.pants, counts.shirt])

  const pageCount = Math.max(1, Math.ceil(sectionItems.length / OPTION_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pagedItems = sectionItems.slice(currentPage * OPTION_PAGE_SIZE, currentPage * OPTION_PAGE_SIZE + OPTION_PAGE_SIZE)

  async function handleOpenSaveBrowser() {
    setSaveBrowserOpen(true)
    setSaveLoading(true)
    setSaveLoadError(null)

    try {
      const slots = await scanDefaultSaveSlots()
      const imported = await Promise.all(
        slots.map(async (summary) => {
          const file = await loadTextFile(summary.filePath)
          const profile = parsePlayerAppearanceProfileFromSave(file.content, {
            slotLabel: summary.slotName,
            sourceSaveFolder: summary.folderPath,
            sourceFilePath: summary.filePath,
          })

          return { summary, profile }
        }),
      )
      setSavePreviews(imported)
    } catch (error) {
      setSaveLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaveLoading(false)
    }
  }

  if (!open) {
    return null
  }

  return (
    <div className="appearance-window-backdrop" onClick={onClose}>
      <section className="appearance-window-panel" onClick={(event) => event.stopPropagation()}>
        <header className="appearance-window-header">
          <div className="min-w-0">
            <p className="appearance-window-eyebrow">
              <UserRound className="h-3.5 w-3.5" />
              <span>{copy.title}</span>
            </p>
            <p className="appearance-window-title">{copy.title}</p>
            <p className="appearance-window-copy">{copy.subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className="control-button h-8" onClick={() => void handleOpenSaveBrowser()}>
              <FolderOpen className="h-3.5 w-3.5" />
              <span>{copy.importSave}</span>
            </button>
            <button type="button" className="control-button h-8" onClick={onCreateProfile}>
              <Plus className="h-3.5 w-3.5" />
              <span>{copy.newSlot}</span>
            </button>
            <button type="button" className="control-button h-8" disabled={!activeProfile} onClick={onDuplicateProfile}>
              <CopyPlus className="h-3.5 w-3.5" />
              <span>{copy.duplicateSlot}</span>
            </button>
            <button
              type="button"
              className="control-button h-8"
              disabled={!activeProfile}
              onClick={() => {
                if (!activeProfile || !window.confirm(copy.deleteConfirm(activeProfile.label))) {
                  return
                }

                onDeleteProfile()
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{copy.deleteSlot}</span>
            </button>
            <button type="button" className="workspace-panel-action h-8 w-8" onClick={onClose} title="Close window">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="appearance-window-body">
          <aside className="appearance-window-sidebar">
            <p className="appearance-window-section-label">{copy.slots}</p>
            <div className="appearance-window-slot-list">
              {profiles.map((profile) => {
                const active = profile.id === activeProfile?.id
                return (
                  <button
                    key={profile.id}
                    type="button"
                    className={cx('appearance-window-slot-card', active && 'appearance-window-slot-card-active')}
                    onClick={() => onSelectProfile(profile.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-text-primary truncate text-sm font-semibold">{profile.label}</span>
                      {active ? <span className="player-appearance-badge">{copy.active}</span> : null}
                    </div>
                    <p className="text-text-secondary mt-1 truncate text-xs">{profile.farmerName}</p>
                    {profile.importedAt ? <p className="text-text-tertiary text-meta-px mt-2">{copy.imported}</p> : null}
                  </button>
                )
              })}
            </div>
          </aside>

          {activeProfile ? (
            <div className="appearance-window-main">
              <section className="appearance-window-card appearance-window-hero">
                <div className="appearance-window-hero-copy">
                  <div>
                    <p className="appearance-window-section-title">{copy.previewTitle}</p>
                    <p className="appearance-window-section-copy">{copy.previewCopy}</p>
                  </div>
                  <div className="appearance-window-input-grid">
                    <label className="player-appearance-field">
                      <span className="player-appearance-label">{copy.slotName}</span>
                      <input
                        className="player-appearance-input"
                        value={activeProfile.label}
                        onChange={(event) => onChangeProfile({ ...activeProfile, label: event.target.value })}
                      />
                    </label>
                    <label className="player-appearance-field">
                      <span className="player-appearance-label">{copy.farmerName}</span>
                      <input
                        className="player-appearance-input"
                        value={activeProfile.farmerName}
                        onChange={(event) => onChangeProfile({ ...activeProfile, farmerName: event.target.value })}
                      />
                    </label>
                  </div>
                </div>

                <div className="appearance-window-stage" aria-busy={loadingAssets ? 'true' : undefined}>
                  {loadingAssets ? (
                    <ImageSkeleton overlay rounded={false} className="appearance-window-stage-skeleton" />
                  ) : rootPath ? (
                    <FarmerPreviewSprite profile={activeProfile} assets={previewAssets} scale={6} />
                  ) : (
                    <div className="appearance-window-placeholder">{copy.assetMissing}</div>
                  )}
                </div>
              </section>

              <section className="appearance-window-card">
                <div className="appearance-window-tab-row">
                  {(
                    [
                      ['body', copy.body],
                      ['hair', copy.hair],
                      ['shirt', copy.shirt],
                      ['pants', copy.pants],
                      ['accessory', copy.accessory],
                      ['hat', copy.hat],
                    ] as const
                  ).map(([sectionId, label]) => (
                    <button
                      key={sectionId}
                      type="button"
                      className={cx('appearance-window-tab', activeSection === sectionId && 'appearance-window-tab-active')}
                      onClick={() => {
                        setActiveSection(sectionId)
                        setPage(0)
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {activeSection === 'body' ? (
                  <div className="appearance-window-body-section">
                    <div>
                      <p className="appearance-window-section-title">{copy.bodyTitle}</p>
                      <p className="appearance-window-section-copy">{copy.bodyCopy}</p>
                    </div>

                    <div className="appearance-window-body-layout">
                      <div className="appearance-window-inspector-stack">
                        <div className="appearance-window-choice-grid appearance-window-choice-grid-body">
                          {(
                            [
                              [false, copy.male],
                              [true, copy.female],
                            ] as const
                          ).map(([isFemale, label]) => (
                            <button
                              key={label}
                              type="button"
                              className={cx(
                                'appearance-window-choice-card',
                                activeProfile.isFemale === isFemale && 'appearance-window-choice-card-active',
                              )}
                              onClick={() => onChangeProfile({ ...activeProfile, isFemale })}
                            >
                              <FarmerPreviewSprite profile={{ ...activeProfile, isFemale }} assets={previewAssets} scale={3} />
                              <span className="appearance-window-choice-label">{label}</span>
                            </button>
                          ))}
                        </div>

                        <div className="appearance-window-color-grid">
                          {(
                            [
                              ['hairColor', copy.hairColor],
                              ['eyeColor', copy.eyeColor],
                              ['shirtColor', copy.shirtColor],
                              ['pantsColor', copy.pantsColor],
                            ] as const
                          ).map(([key, label]) => (
                            <label key={key} className="appearance-window-color-card">
                              <span className="player-appearance-label">{label}</span>
                              <span className="appearance-window-color-meta">{colorToHex(activeProfile[key]).toUpperCase()}</span>
                              <span className="appearance-window-color-swatch" style={{ background: colorToHex(activeProfile[key]) }} />
                              <input
                                type="color"
                                className="player-appearance-color"
                                value={colorToHex(activeProfile[key])}
                                onChange={(event) => onChangeProfile(updateColor(activeProfile, key, event.target.value))}
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="appearance-window-palette-stack">
                        <div className="appearance-window-palette-section">
                          <p className="appearance-window-section-label">{copy.skin}</p>
                          <div className="appearance-window-palette-grid">
                            {Array.from({ length: SKIN_TONE_OPTIONS }, (_, index) => (
                              <button
                                key={`skin:${index}`}
                                type="button"
                                className={cx(
                                  'appearance-window-palette-card',
                                  activeProfile.skinToneIndex === index && 'appearance-window-palette-card-active',
                                )}
                                onClick={() => onChangeProfile({ ...activeProfile, skinToneIndex: index })}
                              >
                                <span className="appearance-window-palette-preview">
                                  <span
                                    className="appearance-window-palette-stop appearance-window-palette-stop-solid"
                                    style={{ background: buildPalettePrimaryColor(previewAssets.skinColors, index, 3) }}
                                  />
                                </span>
                                <span className="appearance-window-palette-index">#{index}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="appearance-window-palette-section">
                          <p className="appearance-window-section-label">{copy.shoes}</p>
                          <div className="appearance-window-palette-grid">
                            {Array.from({ length: SHOE_COLOR_OPTIONS }, (_, index) => (
                              <button
                                key={`shoes:${index}`}
                                type="button"
                                className={cx(
                                  'appearance-window-palette-card',
                                  activeProfile.shoesIndex === index && 'appearance-window-palette-card-active',
                                )}
                                onClick={() => onChangeProfile({ ...activeProfile, shoesIndex: index })}
                              >
                                <span className="appearance-window-palette-preview">
                                  <span
                                    className="appearance-window-palette-stop appearance-window-palette-stop-solid"
                                    style={{ background: buildPalettePrimaryColor(previewAssets.shoeColors, index, 4) }}
                                  />
                                </span>
                                <span className="appearance-window-palette-index">#{index}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="appearance-window-section-toolbar">
                      <div>
                        <p className="appearance-window-section-title">
                          {
                            {
                              hair: copy.hair,
                              shirt: copy.shirt,
                              pants: copy.pants,
                              accessory: copy.accessory,
                              hat: copy.hat,
                              body: copy.body,
                            }[activeSection]
                          }
                        </p>
                        <p className="appearance-window-section-copy">{copy.page(currentPage + 1, pageCount)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="tool-button"
                          disabled={currentPage === 0}
                          onClick={() => setPage((value) => Math.max(0, value - 1))}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="tool-button"
                          disabled={currentPage >= pageCount - 1}
                          onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {!rootPath ? (
                      <div className="appearance-window-placeholder">{copy.assetMissing}</div>
                    ) : loadingAssets ? (
                      <ImageSkeleton className="appearance-window-placeholder-skeleton" />
                    ) : pagedItems.length === 0 ? (
                      <div className="appearance-window-placeholder">{copy.sectionEmpty}</div>
                    ) : (
                      <div className="appearance-window-choice-grid">
                        {pagedItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={cx('appearance-window-choice-card', item.active && 'appearance-window-choice-card-active')}
                            onClick={() => onChangeProfile(item.profile)}
                          >
                            <FarmerPreviewSprite profile={item.profile} assets={previewAssets} scale={3} />
                            <span className="appearance-window-choice-label">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>

              <section className="appearance-window-card">
                <p className="appearance-window-section-title">{copy.importedMeta}</p>
                <div className="player-appearance-meta-grid">
                  {(
                    [
                      [copy.saveFolder, activeProfile.sourceSaveFolder],
                      [copy.sourceFile, activeProfile.sourceFilePath],
                      [copy.importedAt, activeProfile.importedAt],
                      [copy.customHair, activeProfile.customHairId],
                      [copy.customHat, activeProfile.customHatId],
                      [copy.customShirt, activeProfile.customShirtId],
                      [copy.customPants, activeProfile.customPantsId],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="player-appearance-meta-card">
                      <p className="player-appearance-label">{label}</p>
                      <p className="player-appearance-meta-value">{value || copy.notSet}</p>
                    </div>
                  ))}
                </div>
                <div className="player-appearance-note">{copy.unsupported}</div>
              </section>
            </div>
          ) : null}
        </div>

        {saveBrowserOpen ? (
          <div className="appearance-window-modal-backdrop">
            <section className="appearance-window-modal-panel">
              <div className="appearance-window-section-toolbar">
                <div>
                  <p className="appearance-window-section-title">{copy.importSaveTitle}</p>
                  <p className="appearance-window-section-copy">{copy.importSaveCopy}</p>
                </div>
                <button type="button" className="workspace-panel-action h-8 w-8" onClick={() => setSaveBrowserOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="appearance-window-modal-body">
                {saveLoading ? <ImageSkeleton className="appearance-window-placeholder-skeleton" /> : null}
                {!saveLoading && saveLoadError ? (
                  <div className="appearance-window-placeholder">
                    {copy.importLoadFailed}: {saveLoadError}
                  </div>
                ) : null}
                {!saveLoading && !saveLoadError && savePreviews.length === 0 ? (
                  <div className="appearance-window-placeholder">{copy.importEmpty}</div>
                ) : null}
                {!saveLoading && !saveLoadError && savePreviews.length > 0 ? (
                  <div className="appearance-window-import-grid">
                    {savePreviews.map(({ summary, profile }) => (
                      <article key={summary.filePath} className="appearance-window-import-card">
                        <div className="appearance-window-import-preview">
                          <FarmerPreviewSprite profile={profile} assets={previewAssets} scale={4} />
                        </div>
                        <div className="min-w-0">
                          <p className="appearance-window-section-title">{summary.slotName}</p>
                          <p className="appearance-window-section-copy">{profile.farmerName}</p>
                          <p className="appearance-window-import-meta">{summary.folderPath}</p>
                          <p className="appearance-window-import-meta">{new Date(summary.modifiedTimeMs).toLocaleString(locale)}</p>
                        </div>
                        <button
                          type="button"
                          className="control-button h-8"
                          onClick={() => {
                            onImportProfile(profile)
                            setSaveBrowserOpen(false)
                          }}
                        >
                          {copy.importUse}
                        </button>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  )
}
