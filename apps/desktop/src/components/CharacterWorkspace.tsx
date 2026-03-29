import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  buildActorBreathingLayerDescriptor,
  getActorSpriteFrameHeight,
  getPortraitFrameBounds,
} from '../lib/app/eventStageAssets'
import { getActorWalkAnimationState, getSpringObjectsSourceRect, type EventActorState } from '../lib/app/eventStageShared'
import {
  getCharacterPortraitFrameCount,
  type CharacterAppearanceVariant,
  type CharacterGiftGroup,
  type CharacterGiftGroupKind,
  type CharacterGiftItem,
  type CharacterVisualAssetState,
  type CharacterWorkspaceEntry,
} from '../lib/app/characterWorkspace'
import type { CharactersPanelCopy } from '../lib/editor-shell'
import { cx } from '../lib/cx'
import { ItemGroupPopover } from './ItemGroupPopover'

type CharacterWorkspaceProps = {
  copy: CharactersPanelCopy
  character: CharacterWorkspaceEntry | null
  activeVariant: CharacterAppearanceVariant | null
  assetState: CharacterVisualAssetState
}

type GiftTone = 'love' | 'like' | 'neutral' | 'dislike' | 'hate'

const WALK_DIRECTIONS = [
  { id: 'down', direction: 2 },
  { id: 'left', direction: 3 },
  { id: 'right', direction: 1 },
  { id: 'up', direction: 0 },
] as const

const WALK_FRAME_DURATION_MS = 180
const BREATHING_PREVIEW_SCALE = 6
const PORTRAIT_PREVIEW_SCALE = 2
const GIFT_ICON_SCALE = 2

const GIFT_TONE_STYLES: Record<
  GiftTone,
  {
    sectionClassName: string
    dotClassName: string
  }
> = {
  love: {
    sectionClassName:
      'border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,var(--bg-panel))]',
    dotClassName: 'bg-[var(--success)]',
  },
  like: {
    sectionClassName:
      'border-[color-mix(in_srgb,var(--accent)_26%,transparent)] bg-[color-mix(in_srgb,var(--accent-soft)_84%,var(--bg-panel))]',
    dotClassName: 'bg-[var(--accent)]',
  },
  neutral: {
    sectionClassName: 'border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-elevated)_72%,var(--bg-panel))]',
    dotClassName: 'bg-[var(--text-tertiary)]',
  },
  dislike: {
    sectionClassName:
      'border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--bg-panel))]',
    dotClassName: 'bg-[var(--warning)]',
  },
  hate: {
    sectionClassName:
      'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,var(--bg-panel))]',
    dotClassName: 'bg-[var(--danger)]',
  },
}

const GIFT_GROUP_KIND_STYLES: Record<
  CharacterGiftGroupKind,
  {
    cardClassName: string
  }
> = {
  item: {
    cardClassName: 'border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_94%,transparent)]',
  },
  category: {
    cardClassName: 'border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent-soft)_84%,var(--bg-panel))]',
  },
  tag: {
    cardClassName: 'border-[color-mix(in_srgb,var(--warning)_28%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--bg-panel))]',
  },
  default: {
    cardClassName: 'border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-elevated)_72%,var(--bg-panel))]',
  },
  special: {
    cardClassName: 'border-[color-mix(in_srgb,var(--success)_28%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,var(--bg-panel))]',
  },
}

const GIFT_GROUP_KIND_LABEL_KEYS: Record<
  CharacterGiftGroupKind,
  'giftRuleItem' | 'giftRuleCategory' | 'giftRuleTag' | 'giftRuleDefault' | 'giftRuleSpecial'
> = {
  item: 'giftRuleItem',
  category: 'giftRuleCategory',
  tag: 'giftRuleTag',
  default: 'giftRuleDefault',
  special: 'giftRuleSpecial',
}

type GiftLabelKey =
  | 'giftCategoryGem'
  | 'giftCategoryItem'
  | 'giftCategoryFish'
  | 'giftCategoryEgg'
  | 'giftCategoryMilk'
  | 'giftCategoryCooking'
  | 'giftCategoryCrafting'
  | 'giftCategoryMineral'
  | 'giftCategoryAnimalProduct'
  | 'giftCategoryMetalResource'
  | 'giftCategoryBuildingResource'
  | 'giftCategoryFlower'
  | 'giftCategoryForage'
  | 'giftCategoryArtisan'
  | 'giftCategorySyrup'
  | 'giftCategoryMonsterLoot'
  | 'giftCategoryFertilizer'
  | 'giftCategoryTrash'
  | 'giftCategoryBait'
  | 'giftCategoryFishingTackle'
  | 'giftCategoryDecor'
  | 'giftCategoryIngredient'
  | 'giftCategorySeed'
  | 'giftCategoryVegetable'
  | 'giftCategoryFruit'
  | 'giftCategoryEquipment'
  | 'giftCategoryHat'
  | 'giftCategoryRing'
  | 'giftCategoryBoots'
  | 'giftCategoryWeapon'
  | 'giftCategoryTool'
  | 'giftCategoryClothing'
  | 'giftCategoryTrinket'
  | 'giftCategoryBook'
  | 'giftCategorySkillBook'
  | 'giftCategoryLitter'
  | 'giftDefaultLowPrice'
  | 'giftDefaultInedible'
  | 'giftSpecialArch'
  | 'giftTagBook'
  | 'giftTagGoods'
  | 'giftTagRed'
  | 'giftTagBlue'
  | 'giftTagGreen'
  | 'giftTagYellow'
  | 'giftTagPurple'
  | 'giftTagBlack'
  | 'giftTagWhite'
  | 'giftTagOrange'
  | 'giftTagOcean'
  | 'giftTagRiver'
  | 'giftTagLake'
  | 'giftTagCrabPot'

const GIFT_CATEGORY_LABEL_KEYS: Record<string, GiftLabelKey> = {
  '0': 'giftCategoryItem',
  '-2': 'giftCategoryGem',
  '-4': 'giftCategoryFish',
  '-5': 'giftCategoryEgg',
  '-6': 'giftCategoryMilk',
  '-7': 'giftCategoryCooking',
  '-8': 'giftCategoryCrafting',
  '-12': 'giftCategoryMineral',
  '-14': 'giftCategoryAnimalProduct',
  '-15': 'giftCategoryMetalResource',
  '-16': 'giftCategoryBuildingResource',
  '-18': 'giftCategoryFlower',
  '-19': 'giftCategoryFertilizer',
  '-20': 'giftCategoryTrash',
  '-21': 'giftCategoryBait',
  '-22': 'giftCategoryForage',
  '-23': 'giftCategoryFishingTackle',
  '-24': 'giftCategoryDecor',
  '-25': 'giftCategoryIngredient',
  '-26': 'giftCategoryArtisan',
  '-27': 'giftCategorySyrup',
  '-28': 'giftCategoryMonsterLoot',
  '-29': 'giftCategoryEquipment',
  '-74': 'giftCategorySeed',
  '-75': 'giftCategoryVegetable',
  '-79': 'giftCategoryFruit',
  '-80': 'giftCategoryFlower',
  '-81': 'giftCategoryForage',
  '-95': 'giftCategoryHat',
  '-96': 'giftCategoryRing',
  '-97': 'giftCategoryBoots',
  '-98': 'giftCategoryWeapon',
  '-99': 'giftCategoryTool',
  '-100': 'giftCategoryClothing',
  '-101': 'giftCategoryTrinket',
  '-102': 'giftCategoryBook',
  '-103': 'giftCategorySkillBook',
  '-999': 'giftCategoryLitter',
}

const GIFT_DEFAULT_LABEL_KEYS: Record<string, GiftLabelKey> = {
  'default:low-price': 'giftDefaultLowPrice',
  'default:inedible': 'giftDefaultInedible',
}

const GIFT_SPECIAL_LABEL_KEYS: Record<string, GiftLabelKey> = {
  'special:arch': 'giftSpecialArch',
}

const GIFT_TAG_EXACT_LABEL_KEYS: Record<string, GiftLabelKey> = {
  artisan_good: 'giftCategoryArtisan',
  book_item: 'giftTagBook',
  cooking_item: 'giftCategoryCooking',
  crab_pot: 'giftTagCrabPot',
  egg_item: 'giftCategoryEgg',
  fish_item: 'giftCategoryFish',
  flower_item: 'giftCategoryFlower',
  forage_item: 'giftCategoryForage',
  fruit_item: 'giftCategoryFruit',
  gem_item: 'giftCategoryGem',
  milk_item: 'giftCategoryMilk',
  mineral_item: 'giftCategoryMineral',
  monster_loot: 'giftCategoryMonsterLoot',
  seed_item: 'giftCategorySeed',
  syrup_item: 'giftCategorySyrup',
  vegetable_item: 'giftCategoryVegetable',
}

const GIFT_TAG_TOKEN_LABEL_KEYS: Record<string, GiftLabelKey | ''> = {
  artisan: 'giftCategoryArtisan',
  black: 'giftTagBlack',
  blue: 'giftTagBlue',
  book: 'giftTagBook',
  cooking: 'giftCategoryCooking',
  crab: 'giftTagCrabPot',
  egg: 'giftCategoryEgg',
  fish: 'giftCategoryFish',
  flower: 'giftCategoryFlower',
  forage: 'giftCategoryForage',
  fruit: 'giftCategoryFruit',
  gem: 'giftCategoryGem',
  good: 'giftTagGoods',
  goods: 'giftTagGoods',
  green: 'giftTagGreen',
  item: '',
  items: '',
  lake: 'giftTagLake',
  loot: '',
  milk: 'giftCategoryMilk',
  mineral: 'giftCategoryMineral',
  monster: 'giftCategoryMonsterLoot',
  ocean: 'giftTagOcean',
  orange: 'giftTagOrange',
  pot: '',
  purple: 'giftTagPurple',
  red: 'giftTagRed',
  river: 'giftTagRiver',
  seed: 'giftCategorySeed',
  syrup: 'giftCategorySyrup',
  tag: '',
  vegetable: 'giftCategoryVegetable',
  white: 'giftTagWhite',
  yellow: 'giftTagYellow',
}

function buildSpriteStyle({
  url,
  sheetWidth,
  sheetHeight,
  sourceX,
  sourceY,
  width,
  height,
  scale = 4,
}: {
  url: string
  sheetWidth: number
  sheetHeight: number
  sourceX: number
  sourceY: number
  width: number
  height: number
  scale?: number
}): CSSProperties {
  return {
    width: `${width * scale}px`,
    height: `${height * scale}px`,
    backgroundImage: `url("${url}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `-${sourceX * scale}px -${sourceY * scale}px`,
    backgroundSize: `${sheetWidth * scale}px ${sheetHeight * scale}px`,
    imageRendering: 'pixelated',
  }
}

function buildAbsoluteSpriteLayerStyle({
  url,
  sheetWidth,
  sheetHeight,
  sourceX,
  sourceY,
  width,
  height,
}: {
  url: string
  sheetWidth: number
  sheetHeight: number
  sourceX: number
  sourceY: number
  width: number
  height: number
}): CSSProperties {
  return {
    width: `${width}px`,
    height: `${height}px`,
    backgroundImage: `url("${url}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `-${sourceX}px -${sourceY}px`,
    backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
    imageRendering: 'pixelated',
  }
}

function createMockActor(character: CharacterWorkspaceEntry): EventActorState {
  return {
    id: `${character.key}:preview`,
    actorName: character.internalName,
    tileX: 0,
    tileY: 0,
    offsetX: 0,
    offsetY: 0,
    visible: true,
    facingDirection: 2,
    frame: 0,
    directionalFlip: false,
    portraitOverrideSuffix: null,
    spriteOverrideSuffix: null,
    animation: null,
    movement: null,
    breatherOverride: character.breather,
    shakeStartedAtMs: null,
    shakeDurationMs: 0,
    farmerPassesThrough: false,
    farmerRenderState: null,
  }
}

function DirectionAnimationCard({
  label,
  frameWidth,
  frameHeight,
  spriteColumns,
  spriteUrl,
  spriteSheetWidth,
  spriteSheetHeight,
  frames,
  nowMs,
}: {
  label: string
  frameWidth: number
  frameHeight: number
  spriteColumns: number
  spriteUrl: string
  spriteSheetWidth: number
  spriteSheetHeight: number
  frames: number[]
  nowMs: number
}) {
  const frameIndex = Math.floor(nowMs / WALK_FRAME_DURATION_MS) % Math.max(1, frames.length)
  const currentFrame = frames[frameIndex] ?? frames[0] ?? 0
  const sourceX = (currentFrame % spriteColumns) * frameWidth
  const sourceY = Math.floor(currentFrame / spriteColumns) * frameHeight

  return (
    <div className="panel-section p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="panel-section-title">{label}</p>
        <span className="dock-chip">{frames.length}</span>
      </div>

      <div className="panel-canvas-soft mt-2.5 flex min-h-[148px] items-center justify-center">
        <div
          style={buildSpriteStyle({
            url: spriteUrl,
            sheetWidth: spriteSheetWidth,
            sheetHeight: spriteSheetHeight,
            sourceX,
            sourceY,
            width: frameWidth,
            height: frameHeight,
          })}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-center gap-1.5">
        {frames.map((frame, index) => (
          <span
            key={`${label}:${frame}:${index}`}
            className={cx(
              'h-1.5 w-5 rounded-full transition-colors',
              index === frameIndex ? 'bg-[var(--accent)]' : 'bg-[var(--border-color)]',
            )}
          />
        ))}
      </div>
    </div>
  )
}

function GiftTasteSection({
  title,
  groups,
  copy,
  emptyLabel,
  springObjectsUrl,
  springObjectsSheetWidth,
  springObjectsSheetHeight,
  tone,
}: {
  title: string
  groups: CharacterGiftGroup[]
  copy: CharactersPanelCopy
  emptyLabel: string
  springObjectsUrl: string | null
  springObjectsSheetWidth: number | null
  springObjectsSheetHeight: number | null
  tone: GiftTone
}) {
  const toneStyle = GIFT_TONE_STYLES[tone]

  return (
    <div
      className={`panel-section relative w-fit max-w-full p-3 ${toneStyle.sectionClassName}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', toneStyle.dotClassName)} />
          <p className="panel-section-title truncate">{title}</p>
        </div>
      </div>

      {groups.length && springObjectsUrl && springObjectsSheetWidth && springObjectsSheetHeight ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {groups.map((group) => {
              const isExpandable = group.kind !== 'item' || group.items.length > 1
              if (!isExpandable) {
                return (
                  <GiftGroupCard
                    key={`${title}:${group.key}`}
                    copy={copy}
                    group={group}
                    isActive={false}
                    springObjectsUrl={springObjectsUrl}
                    springObjectsSheetWidth={springObjectsSheetWidth}
                    springObjectsSheetHeight={springObjectsSheetHeight}
                  />
                )
              }

              return (
                <ItemGroupPopover
                  key={`${title}:${group.key}`}
                  groupIcon={(isOpen) => (
                    <GiftGroupCard
                      copy={copy}
                      group={group}
                      isActive={isOpen}
                      springObjectsUrl={springObjectsUrl}
                      springObjectsSheetWidth={springObjectsSheetWidth}
                      springObjectsSheetHeight={springObjectsSheetHeight}
                    />
                  )}
                  items={group.items}
                  title={getGiftGroupKindLabel(copy, group.kind)}
                  subtitle={getGiftGroupDisplayLabel(copy, group)}
                  renderItem={(item) => (
                    <GiftItemTile
                      item={item}
                      springObjectsUrl={springObjectsUrl}
                      springObjectsSheetWidth={springObjectsSheetWidth}
                      springObjectsSheetHeight={springObjectsSheetHeight}
                    />
                  )}
                />
              )
            })}
          </div>
        </>
      ) : (
        <div className="panel-empty-state mt-3 text-xs leading-5">
          {emptyLabel}
        </div>
      )}
    </div>
  )
}

function getGiftGroupKindLabel(copy: CharactersPanelCopy, kind: CharacterGiftGroupKind) {
  return copy[GIFT_GROUP_KIND_LABEL_KEYS[kind]]
}

function getGiftGroupDisplayLabel(copy: CharactersPanelCopy, group: CharacterGiftGroup) {
  const categoryLabelKey = GIFT_CATEGORY_LABEL_KEYS[group.key.slice('category:'.length)]
  const defaultLabelKey = GIFT_DEFAULT_LABEL_KEYS[group.key]
  const specialLabelKey = GIFT_SPECIAL_LABEL_KEYS[group.key]
  const resolvedLabels: Partial<Record<CharacterGiftGroupKind, string>> = {
    category: categoryLabelKey ? copy[categoryLabelKey] : undefined,
    default: defaultLabelKey ? copy[defaultLabelKey] : undefined,
    special: specialLabelKey ? copy[specialLabelKey] : undefined,
    tag: formatGiftTagLabel(copy, group.label),
  }

  return resolvedLabels[group.kind] ?? group.label
}

function formatGiftTagLabel(copy: CharactersPanelCopy, rawLabel: string) {
  const normalized = rawLabel.trim().toLowerCase()
  const exactLabelKey = GIFT_TAG_EXACT_LABEL_KEYS[normalized]
  const translated = normalized
    .split(/[_-]+/u)
    .map((token) => {
      const labelKey = GIFT_TAG_TOKEN_LABEL_KEYS[token]
      return labelKey ? copy[labelKey] : token
    })
    .filter(Boolean)

  return (exactLabelKey ? copy[exactLabelKey] : undefined) ?? translated.join('')
}

function GiftItemName({ label }: { label: string }) {
  return (
    <p className="line-clamp-2 w-full text-center text-[12px] leading-4 text-[var(--text-primary)]">{label}</p>
  )
}

function GiftItemTile({
  item,
  springObjectsUrl,
  springObjectsSheetWidth,
  springObjectsSheetHeight,
  fluid = false,
  absolute = false,
  anchorX = 0,
  anchorY = 0,
  isExpanded = true,
  animationIndex = 0,
  animationItemCount = 1,
  animationFromBottom = false,
}: {
  item: CharacterGiftItem
  springObjectsUrl: string
  springObjectsSheetWidth: number
  springObjectsSheetHeight: number
  fluid?: boolean
  absolute?: boolean
  anchorX?: number
  anchorY?: number
  isExpanded?: boolean
  animationIndex?: number
  animationItemCount?: number
  animationFromBottom?: boolean
}) {
  const sourceRect = item.objectIndex != null ? getSpringObjectsSourceRect(item.objectIndex) : null
  const ringCapacities = [8, 12, 16, 20]
  let ringIndex = 0
  let localIndex = animationIndex
  let consumed = 0
  while (ringIndex < ringCapacities.length - 1 && localIndex >= ringCapacities[ringIndex]!) {
    localIndex -= ringCapacities[ringIndex]!
    consumed += ringCapacities[ringIndex]!
    ringIndex += 1
  }
  const itemsInRing = Math.min(ringCapacities[ringIndex]!, Math.max(1, animationItemCount - consumed))
  const angleStep = itemsInRing > 0 ? 360 / itemsInRing : 360
  const startAngle = animationFromBottom ? -90 : -90
  const angle = startAngle + localIndex * angleStep
  const radius = 82 + ringIndex * 60
  const radians = (angle * Math.PI) / 180
  const offsetX = Math.sin(radians) * radius
  const offsetY = Math.cos(radians) * radius
  const delayMs = Math.min(280, ringIndex * 36 + localIndex * 22)

  return (
    <div
      className={cx(
        absolute
          ? 'pointer-events-none absolute h-[58px] w-[58px]'
          : 'rounded-2xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_92%,transparent)] px-2 py-2.5 shadow-[0_6px_16px_rgba(15,23,42,0.06)]',
        absolute ? '' : fluid ? 'min-w-0 w-full' : 'w-[88px]',
      )}
      title={item.displayName}
      style={{
        left: absolute ? `${anchorX}px` : undefined,
        top: absolute ? `${anchorY}px` : undefined,
        opacity: isExpanded ? 1 : 0,
        transform: absolute
          ? isExpanded
            ? `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(1)`
            : 'translate(-50%, -50%) scale(0.24)'
          : isExpanded
            ? 'translate(0px, 0px) scale(1)'
            : `translate(${offsetX}px, ${offsetY}px) scale(0.28)`,
        animation: absolute && isExpanded ? `gift-bubble-pop 480ms cubic-bezier(0.22, 1.24, 0.32, 1) both` : undefined,
        animationDelay: absolute && isExpanded ? `${delayMs}ms` : undefined,
        transition: isExpanded ? undefined : 'transform 180ms ease-in, opacity 140ms linear',
        ['--gift-target-x' as string]: absolute ? `${offsetX}px` : undefined,
        ['--gift-target-y' as string]: absolute ? `${offsetY}px` : undefined,
      }}
    >
      <div className={cx('flex flex-col items-center gap-2', absolute && 'h-full w-full justify-center')}>
        <div
          className={cx(
            'relative shrink-0 overflow-hidden border border-[var(--border-color)] bg-[var(--bg-panel-muted)]',
            absolute
              ? 'h-[52px] w-[52px] rounded-full bg-[radial-gradient(circle_at_32%_28%,color-mix(in_srgb,var(--bg-panel)_96%,rgba(255,255,255,0.14)),color-mix(in_srgb,var(--bg-panel-muted)_86%,transparent)_58%,transparent)] shadow-[0_12px_28px_color-mix(in_srgb,var(--accent)_18%,transparent)]'
              : 'h-10 w-10 rounded-xl',
          )}
        >
          {absolute ? (
            <>
              <div className="pointer-events-none absolute inset-[5px] rounded-full border border-[color-mix(in_srgb,var(--accent)_18%,transparent)]" />
              <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_68%)]" />
            </>
          ) : null}
          {sourceRect ? (
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                ...buildAbsoluteSpriteLayerStyle({
                  url: springObjectsUrl,
                  sheetWidth: springObjectsSheetWidth,
                  sheetHeight: springObjectsSheetHeight,
                  sourceX: sourceRect.x,
                  sourceY: sourceRect.y,
                  width: sourceRect.width,
                  height: sourceRect.height,
                }),
                transform: `translate(-50%, -50%) scale(${absolute ? GIFT_ICON_SCALE + 0.15 : GIFT_ICON_SCALE})`,
                transformOrigin: 'center center',
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
              ?
            </div>
          )}
        </div>
        {absolute ? null : <GiftItemName label={item.displayName} />}
      </div>
    </div>
  )
}

function GiftGroupCard({
  copy,
  group,
  isActive,
  springObjectsUrl,
  springObjectsSheetWidth,
  springObjectsSheetHeight,
}: {
  copy: CharactersPanelCopy
  group: CharacterGiftGroup
  isActive: boolean
  springObjectsUrl: string
  springObjectsSheetWidth: number
  springObjectsSheetHeight: number
}) {
  const kindStyle = GIFT_GROUP_KIND_STYLES[group.kind]
  const previewItem = group.items[0] ?? null
  const previewRect = previewItem?.objectIndex != null ? getSpringObjectsSourceRect(previewItem.objectIndex) : null

  return (
    <div
      className={cx(
        'relative w-[96px] rounded-2xl border px-2 py-2.5 text-left transition-all duration-200',
        kindStyle.cardClassName,
        isActive &&
          'scale-[1.035] border-[color-mix(in_srgb,var(--accent)_42%,transparent)] ring-2 ring-[color-mix(in_srgb,var(--accent)_24%,transparent)] shadow-[0_12px_30px_color-mix(in_srgb,var(--accent)_18%,transparent)]',
      )}
      title={`${getGiftGroupKindLabel(copy, group.kind)} / ${getGiftGroupDisplayLabel(copy, group)}`}
    >
      <div
        className={cx(
          'pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-200',
          isActive && 'opacity-100',
        )}
        style={{
          background:
            'radial-gradient(circle at center, color-mix(in_srgb,var(--accent)_18%,transparent), transparent 62%)',
        }}
      />
      <div className="flex flex-col items-center gap-2">
        <div
          data-gift-anchor="true"
          className={cx(
            'relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] transition-transform duration-200',
            isActive && 'scale-110',
          )}
        >
          {previewRect ? (
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                ...buildAbsoluteSpriteLayerStyle({
                  url: springObjectsUrl,
                  sheetWidth: springObjectsSheetWidth,
                  sheetHeight: springObjectsSheetHeight,
                  sourceX: previewRect.x,
                  sourceY: previewRect.y,
                  width: previewRect.width,
                  height: previewRect.height,
                }),
                transform: `translate(-50%, -50%) scale(${GIFT_ICON_SCALE})`,
                transformOrigin: 'center center',
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
              ?
            </div>
          )}

        </div>

        <div className="w-full space-y-1 text-center">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
            {getGiftGroupKindLabel(copy, group.kind)}
          </p>
          <p className="line-clamp-2 text-[12px] leading-4 text-[var(--text-primary)]">{getGiftGroupDisplayLabel(copy, group)}</p>
        </div>
      </div>
    </div>
  )
}

export default function CharacterWorkspace({
  copy,
  character,
  activeVariant,
  assetState,
}: CharacterWorkspaceProps) {
  const [nowMs, setNowMs] = useState(() => performance.now())

  useEffect(() => {
    if (!character || !assetState.spriteUrl) {
      return
    }

    let frameId = 0
    const tick = () => {
      setNowMs(performance.now())
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [assetState.spriteUrl, character])

  const frameWidth = character?.spriteWidth ?? 16
  const frameHeight = character ? Math.max(character.spriteHeight, getActorSpriteFrameHeight(character.internalName)) : 32
  const spriteColumns =
    assetState.spriteSheetWidth && assetState.spriteSheetWidth >= frameWidth
      ? Math.max(1, Math.floor(assetState.spriteSheetWidth / frameWidth))
      : 4
  const portraitCount = getCharacterPortraitFrameCount(assetState.portraitSheetWidth, assetState.portraitSheetHeight)

  const breathingLayer = useMemo(() => {
    if (!character || !assetState.spriteUrl || !assetState.spriteSheetWidth || !assetState.spriteSheetHeight) {
      return null
    }

    const breathSeed = character.internalName.split('').reduce((sum, part) => sum + part.charCodeAt(0), 0)
    const breathingScale = 1 + Math.max(0, Math.ceil(Math.sin(nowMs / 600 + breathSeed)) / 16)

    return buildActorBreathingLayerDescriptor(
      {
        requestKey: `${character.key}:${activeVariant?.key ?? 'default'}`,
        textureName: character.textureName,
        spriteTextureName: activeVariant?.spriteAssetName ?? character.spriteAssetName,
        portraitTextureName: activeVariant?.portraitAssetName ?? character.portraitAssetName,
        spritePath: assetState.spritePath,
        spriteUrl: assetState.spriteUrl,
        spriteSheetWidth: assetState.spriteSheetWidth,
        spriteSheetHeight: assetState.spriteSheetHeight,
        portraitPath: assetState.portraitPath,
        portraitUrl: assetState.portraitUrl,
        portraitSheetWidth: assetState.portraitSheetWidth,
        portraitSheetHeight: assetState.portraitSheetHeight,
        farmerAppearance: null,
        characterMetadata: {
          textureName: character.textureName,
          breather: character.breather,
          breathChestRect: character.breathChestRect,
          breathChestPosition: character.breathChestPosition,
          age: character.age,
          gender: character.gender,
        },
      },
      createMockActor(character),
      0,
      frameWidth,
      frameHeight,
      spriteColumns,
      nowMs,
      breathingScale,
      null,
    )
  }, [activeVariant?.key, assetState, character, frameHeight, frameWidth, nowMs, spriteColumns])

  if (!character) {
    return (
      <div className="panel-surface h-full border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div className="panel-canvas-empty h-full border-0 bg-transparent px-6">
          {copy.inspectorEmpty}
        </div>
      </div>
    )
  }

  const spriteUrl = assetState.spriteUrl
  const spriteSheetWidth = assetState.spriteSheetWidth
  const spriteSheetHeight = assetState.spriteSheetHeight
  const portraitUrl = assetState.portraitUrl
  const portraitSheetWidth = assetState.portraitSheetWidth
  const portraitSheetHeight = assetState.portraitSheetHeight
  const springObjectsUrl = assetState.springObjectsUrl
  const springObjectsSheetWidth = assetState.springObjectsSheetWidth
  const springObjectsSheetHeight = assetState.springObjectsSheetHeight
  const giftSections: Array<{ title: string; groups: CharacterGiftGroup[]; tone: GiftTone }> = [
    { title: copy.lovedItemsTitle, groups: character.lovedGiftGroups, tone: 'love' },
    { title: copy.likedItemsTitle, groups: character.likedGiftGroups, tone: 'like' },
    { title: copy.neutralItemsTitle, groups: character.neutralGiftGroups, tone: 'neutral' },
    { title: copy.dislikedItemsTitle, groups: character.dislikedGiftGroups, tone: 'dislike' },
    { title: copy.hatedItemsTitle, groups: character.hatedGiftGroups, tone: 'hate' },
  ]
  return (
    <div className="panel-surface h-full border-[var(--border-color)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel)_96%,transparent),var(--bg-panel))]">
      <style>{`
        @keyframes gift-bubble-pop {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.18);
          }
          62% {
            opacity: 1;
            transform: translate(
                calc(-50% + var(--gift-target-x, 0px)),
                calc(-50% + var(--gift-target-y, 0px))
              )
              scale(1.1);
          }
          82% {
            transform: translate(
                calc(-50% + var(--gift-target-x, 0px)),
                calc(-50% + var(--gift-target-y, 0px))
              )
              scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translate(
                calc(-50% + var(--gift-target-x, 0px)),
                calc(-50% + var(--gift-target-y, 0px))
              )
              scale(1);
          }
        }

        @keyframes gift-bubble-ripple {
          0% {
            opacity: 0.7;
            transform: scale(0.2);
          }
          100% {
            opacity: 0;
            transform: scale(1.8);
          }
        }

        @keyframes gift-bubble-core {
          0% {
            opacity: 0.45;
            transform: scale(0.4);
          }
          55% {
            opacity: 0.24;
            transform: scale(1.2);
          }
          100% {
            opacity: 0;
            transform: scale(1.6);
          }
        }
      `}</style>
      <div className="panel-header">
        <div>
          <p className="panel-title">{copy.workspaceTitle}</p>
          <p className="panel-subtitle">
            {character.displayName} / {copy.workspaceSubtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="dock-chip">{activeVariant?.label ?? copy.defaultVariant}</span>
          <span className="dock-chip">{copy.defaultBadge}</span>
        </div>
      </div>

      <div className="grid h-[calc(100%-58px)] min-h-0 gap-3 p-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="panel-surface min-h-0 border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
            <div className="panel-header">
              <div>
                <p className="panel-title">{copy.walkingTitle}</p>
                <p className="panel-subtitle">{activeVariant?.spritePathLabel ?? character.spriteAssetName}</p>
              </div>
            </div>
            <div className="panel-body min-h-0 overflow-auto p-3">
              {spriteUrl && spriteSheetWidth && spriteSheetHeight ? (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                  {WALK_DIRECTIONS.map(({ id, direction }) => (
                    <DirectionAnimationCard
                      key={id}
                      label={copy.directionLabels[id]}
                      frameWidth={frameWidth}
                      frameHeight={frameHeight}
                      spriteColumns={spriteColumns}
                      spriteUrl={spriteUrl}
                      spriteSheetWidth={spriteSheetWidth}
                      spriteSheetHeight={spriteSheetHeight}
                      frames={getActorWalkAnimationState(character.internalName, direction).frames}
                      nowMs={nowMs}
                    />
                  ))}
                </div>
              ) : (
                <div className="panel-canvas-empty h-full">
                  {copy.spriteMissing}
                </div>
              )}
            </div>
          </div>

          <div className="panel-surface min-h-0 border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
            <div className="panel-header">
              <div>
                <p className="panel-title">{copy.breathingTitle}</p>
                <p className="panel-subtitle">{copy.breathHint}</p>
              </div>
            </div>
            <div className="panel-body flex h-full min-h-0 flex-col p-3">
              {spriteUrl && spriteSheetWidth && spriteSheetHeight ? (
                <div className="panel-canvas relative flex min-h-[320px] flex-1 items-center justify-center">
                  <div
                    className="absolute inset-0 opacity-40"
                    style={{
                      backgroundImage:
                        'linear-gradient(var(--grid-minor) 1px, transparent 1px), linear-gradient(90deg, var(--grid-minor) 1px, transparent 1px)',
                      backgroundSize: '24px 24px',
                    }}
                  />
                  <div className="absolute inset-x-6 bottom-6 h-14 rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] blur-xl" />
                  <div
                    className="relative flex items-center justify-center"
                    style={{
                      width: `${frameWidth * (BREATHING_PREVIEW_SCALE + 8)}px`,
                      height: `${frameHeight * (BREATHING_PREVIEW_SCALE + 4)}px`,
                    }}
                  >
                    <div
                      className="absolute left-1/2 top-1/2"
                      style={{
                        width: `${frameWidth}px`,
                        height: `${frameHeight}px`,
                        marginLeft: `${-frameWidth / 2}px`,
                        marginTop: `${-frameHeight / 2}px`,
                        transform: `scale(${BREATHING_PREVIEW_SCALE})`,
                        transformOrigin: 'center center',
                      }}
                    >
                      <div
                        className="absolute left-0 top-0"
                        style={buildAbsoluteSpriteLayerStyle({
                          url: spriteUrl,
                          sheetWidth: spriteSheetWidth,
                          sheetHeight: spriteSheetHeight,
                          sourceX: 0,
                          sourceY: 0,
                          width: frameWidth,
                          height: frameHeight,
                        })}
                      />
                      {breathingLayer ? (
                        <div
                          className="absolute"
                          style={{
                            left: `${breathingLayer.offsetX}px`,
                            top: `${breathingLayer.offsetY}px`,
                            ...buildAbsoluteSpriteLayerStyle({
                              url: spriteUrl,
                              sheetWidth: spriteSheetWidth,
                              sheetHeight: spriteSheetHeight,
                              sourceX: breathingLayer.sourceX,
                              sourceY: breathingLayer.sourceY,
                              width: breathingLayer.width,
                              height: breathingLayer.height,
                            }),
                            transform: `scale(${breathingLayer.scaleX ?? 1}, ${breathingLayer.scaleY ?? 1})`,
                            transformOrigin: breathingLayer.transformOrigin ?? 'top left',
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="panel-canvas-empty min-h-[320px] flex-1">
                  {copy.spriteMissing}
                </div>
              )}
            </div>
          </div>

          <div className="panel-surface min-h-0 border-[var(--border-color)] bg-[var(--bg-panel-muted)] xl:col-span-2">
            <div className="panel-header">
              <div>
                <p className="panel-title">{copy.giftTastesTitle}</p>
                <p className="panel-subtitle">{character.displayName}</p>
              </div>
            </div>
            <div className="panel-body min-h-0 overflow-auto p-3">
              <div className="flex flex-col items-start gap-3">
                {giftSections.map((section) => (
                  <GiftTasteSection
                    key={section.tone}
                    title={section.title}
                    groups={section.groups}
                    copy={copy}
                    emptyLabel={copy.giftTastesEmpty}
                    springObjectsUrl={springObjectsUrl}
                    springObjectsSheetWidth={springObjectsSheetWidth}
                    springObjectsSheetHeight={springObjectsSheetHeight}
                    tone={section.tone}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="panel-surface min-h-0 border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
          <div className="panel-header">
            <div>
              <p className="panel-title">{copy.portraitTitle}</p>
              <p className="panel-subtitle">
                {copy.expressions}: {portraitCount || 0}
              </p>
            </div>
            <span className="dock-chip">{portraitCount || 0}</span>
          </div>
          <div className="panel-body min-h-0 overflow-auto p-3">
            {portraitUrl && portraitSheetWidth && portraitSheetHeight ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: portraitCount }, (_, index) => {
                  const bounds = getPortraitFrameBounds(
                    {
                      requestKey: `${character.key}:${activeVariant?.key ?? 'default'}:portrait`,
                      textureName: character.textureName,
                      spriteTextureName: null,
                      portraitTextureName: activeVariant?.portraitAssetName ?? character.portraitAssetName,
                      spritePath: null,
                      spriteUrl: null,
                      spriteSheetWidth: null,
                      spriteSheetHeight: null,
                      portraitPath: assetState.portraitPath,
                      portraitUrl,
                      portraitSheetWidth,
                      portraitSheetHeight,
                      farmerAppearance: null,
                      characterMetadata: null,
                    },
                    index,
                  )

                  return (
                    <div
                      key={`portrait:${index}`}
                      className="panel-section p-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="panel-section-title">
                          {copy.expressions} {index}
                        </p>
                        {character.shakePortraits.includes(index) ? <span className="dock-chip">{copy.shakeBadge}</span> : null}
                      </div>
                      <div className="mt-2.5 flex justify-center">
                        <div
                          className="panel-canvas-soft relative"
                          style={{
                            width: `${bounds.frameWidth * PORTRAIT_PREVIEW_SCALE}px`,
                            height: `${bounds.frameHeight * PORTRAIT_PREVIEW_SCALE}px`,
                          }}
                        >
                          <div
                            className="absolute left-0 top-0"
                            style={{
                              ...buildAbsoluteSpriteLayerStyle({
                                url: portraitUrl,
                                sheetWidth: portraitSheetWidth,
                                sheetHeight: portraitSheetHeight,
                                sourceX: bounds.frameX,
                                sourceY: bounds.frameY,
                                width: bounds.frameWidth,
                                height: bounds.frameHeight,
                              }),
                              transform: `scale(${PORTRAIT_PREVIEW_SCALE})`,
                              transformOrigin: 'top left',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="panel-canvas-empty min-h-[240px]">
                {copy.portraitMissing}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
