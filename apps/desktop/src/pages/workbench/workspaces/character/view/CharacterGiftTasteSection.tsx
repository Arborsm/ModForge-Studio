import { getSpringObjectsSourceRect } from '@entities/event'
import type { CharactersPanelCopy } from '@locales/editor-shell'
import { useCharactersCopy } from '@locales/localeContext'
import { cx } from '@shared/lib/cx'
import { ItemGroupPopover } from '@shared/ui/ItemGroupPopover'
import type { CharacterGiftGroup, CharacterGiftGroupKind, CharacterGiftItem } from '../entities/character'
import { buildAbsoluteSpriteLayerStyle } from './characterSpriteStyles'

export type GiftTone = 'love' | 'like' | 'neutral' | 'dislike' | 'hate'

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
      'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--success)_12%,var(--bg-panel)),color-mix(in_srgb,var(--success)_6%,var(--bg-panel-muted)))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--success)_18%,transparent)]',
    dotClassName: 'bg-[var(--success)]',
  },
  like: {
    sectionClassName:
      'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_12%,var(--bg-panel)),color-mix(in_srgb,var(--accent-soft)_92%,var(--bg-panel-muted)))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_18%,transparent)]',
    dotClassName: 'bg-[var(--accent)]',
  },
  neutral: {
    sectionClassName:
      'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--bg-elevated)_76%,var(--bg-panel)),color-mix(in_srgb,var(--bg-panel-muted)_92%,var(--bg-panel)))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border-color)_72%,transparent)]',
    dotClassName: 'bg-[var(--text-tertiary)]',
  },
  dislike: {
    sectionClassName:
      'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--warning)_12%,var(--bg-panel)),color-mix(in_srgb,var(--warning)_6%,var(--bg-panel-muted)))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--warning)_18%,transparent)]',
    dotClassName: 'bg-[var(--warning)]',
  },
  hate: {
    sectionClassName:
      'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--danger)_12%,var(--bg-panel)),color-mix(in_srgb,var(--danger)_6%,var(--bg-panel-muted)))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--danger)_18%,transparent)]',
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
    cardClassName:
      'border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent-soft)_84%,var(--bg-panel))]',
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

export function CharacterGiftTasteSection({
  title,
  groups,
  springObjectsUrl,
  springObjectsSheetWidth,
  springObjectsSheetHeight,
  tone,
}: {
  title: string
  groups: CharacterGiftGroup[]
  springObjectsUrl: string | null
  springObjectsSheetWidth: number | null
  springObjectsSheetHeight: number | null
  tone: GiftTone
}) {
  const copy = useCharactersCopy()
  const toneStyle = GIFT_TONE_STYLES[tone]

  return (
    <div className={`relative w-full max-w-full rounded-[26px] p-3 ${toneStyle.sectionClassName}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', toneStyle.dotClassName)} />
          <p className="panel-section-title truncate">{title}</p>
        </div>
      </div>

      {groups.length && springObjectsUrl && springObjectsSheetWidth && springObjectsSheetHeight ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {groups.map((group) => {
            const isExpandable = group.kind !== 'item' || group.items.length > 1
            if (!isExpandable) {
              return (
                <GiftGroupCard
                  key={`${title}:${group.key}`}
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
      ) : (
        <div className="panel-empty-state mt-3 text-xs leading-5">{copy.giftTastesEmpty}</div>
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
  return <p className="line-clamp-2 w-full text-center text-[12px] leading-4 text-[var(--text-primary)]">{label}</p>
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
  const angle = -90 + localIndex * angleStep
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
        absolute ? '' : fluid ? 'w-full min-w-0' : 'w-[88px]',
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
              className="absolute top-1/2 left-1/2"
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
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tracking-[0.08em] text-[var(--text-secondary)] uppercase">
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
  group,
  isActive,
  springObjectsUrl,
  springObjectsSheetWidth,
  springObjectsSheetHeight,
}: {
  group: CharacterGiftGroup
  isActive: boolean
  springObjectsUrl: string
  springObjectsSheetWidth: number
  springObjectsSheetHeight: number
}) {
  const copy = useCharactersCopy()
  const kindStyle = GIFT_GROUP_KIND_STYLES[group.kind]
  const previewItem = group.items[0] ?? null
  const previewRect = previewItem?.objectIndex != null ? getSpringObjectsSourceRect(previewItem.objectIndex) : null

  return (
    <div
      className={cx(
        'relative w-[96px] rounded-2xl border px-2 py-2.5 text-left transition-all duration-200',
        kindStyle.cardClassName,
        isActive &&
          'scale-[1.035] border-[color-mix(in_srgb,var(--accent)_42%,transparent)] shadow-[0_12px_30px_color-mix(in_srgb,var(--accent)_18%,transparent)] ring-2 ring-[color-mix(in_srgb,var(--accent)_24%,transparent)]',
      )}
      title={`${getGiftGroupKindLabel(copy, group.kind)} / ${getGiftGroupDisplayLabel(copy, group)}`}
    >
      <div
        className={cx(
          'pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-200',
          isActive && 'opacity-100',
        )}
        style={{
          background: 'radial-gradient(circle at center, color-mix(in_srgb,var(--accent)_18%,transparent), transparent 62%)',
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
              className="absolute top-1/2 left-1/2"
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
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tracking-[0.08em] text-[var(--text-secondary)] uppercase">
              ?
            </div>
          )}
        </div>

        <div className="w-full space-y-1 text-center">
          <p className="truncate text-[10px] font-semibold tracking-[0.12em] text-[var(--text-secondary)] uppercase">
            {getGiftGroupKindLabel(copy, group.kind)}
          </p>
          <p className="line-clamp-2 text-[12px] leading-4 text-[var(--text-primary)]">{getGiftGroupDisplayLabel(copy, group)}</p>
        </div>
      </div>
    </div>
  )
}
