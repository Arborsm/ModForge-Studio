import { Building2, ChevronDown, Home, MapPin, Package, PenLine, Search, Sparkles, Store, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { ConstructibleBuildingGroup, BuildingWorkspaceEntry } from '@entities/building'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup } from '@pages/workbench/workspaces/mod'
import { useBuildingsCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { getLoadingMotionChildRevealProps } from '@shared/ui/loading-motion'

const FARM_FARMING_GROUP_KEYS = new Set([
  'Barn',
  'Cabin',
  'Coop',
  'Fish Pond',
  'Greenhouse',
  'Mill',
  'Pet Bowl',
  'Shed',
  'Silo',
  'Slime Hutch',
  'Stable',
  'Well',
])

const FARM_SPECIAL_GROUP_KEYS = new Set(['Desert Obelisk', 'Earth Obelisk', 'Gold Clock', 'Island Obelisk', 'Junimo Hut', 'Water Obelisk'])

type GlyphKind = 'shop' | 'house' | 'farm' | 'spark' | 'pin' | 'mod'

const GLYPH_ICON: Record<GlyphKind, LucideIcon> = {
  shop: Store,
  house: Home,
  farm: Building2,
  spark: Sparkles,
  pin: MapPin,
  mod: Package,
}

type BuildingBrowserPanelProps = {
  constructibleGroups: ConstructibleBuildingGroup[]
  filteredConstructibleGroups: ConstructibleBuildingGroup[]
  worldBuildings: BuildingWorkspaceEntry[]
  filteredWorldBuildings: BuildingWorkspaceEntry[]
  browserSourceMode: BrowserSourceMode
  onBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modBuildingGroups: ModBrowserGroup<BuildingWorkspaceEntry>[]
  activeModBuildingSelectionId: string | null
  activeBuildingId: string | null
  activeBuildingGroupKey: string | null
  buildingFilter: string
  onBuildingFilterChange: (value: string) => void
  onSelectBuilding: (buildingKey: string) => void
  onSelectModBuilding: (entry: ModBrowserEntry<BuildingWorkspaceEntry>) => void
  onOpenBuildingInAuthoring: (buildingKey: string) => void
}

/**
 * Groups world buildings by the layer their location seed assigns them, keeping
 * the seed's render order. Titles stay out of the data: the panel resolves them
 * from the dictionary by key, so a layer never renders an English literal.
 */
function buildWorldBuildingSections(worldBuildings: BuildingWorkspaceEntry[]) {
  const sections = new Map<string, { key: string; order: number; items: BuildingWorkspaceEntry[] }>()

  for (const building of worldBuildings) {
    const key = building.metadata.worldSeedGroupKey ?? 'ungrouped'
    const order = Number.parseInt(building.metadata.worldSeedGroupOrder ?? '999', 10)
    const existing = sections.get(key)
    if (existing) {
      existing.items.push(building)
      continue
    }

    sections.set(key, { key, order, items: [building] })
  }

  return Array.from(sections.values()).sort((left, right) => left.order - right.order || left.key.localeCompare(right.key))
}

function buildConstructibleSections(constructibleGroups: ConstructibleBuildingGroup[]) {
  const farming: ConstructibleBuildingGroup[] = []
  const special: ConstructibleBuildingGroup[] = []
  const other: ConstructibleBuildingGroup[] = []

  for (const group of constructibleGroups) {
    if (FARM_FARMING_GROUP_KEYS.has(group.key)) {
      farming.push(group)
      continue
    }

    if (FARM_SPECIAL_GROUP_KEYS.has(group.key)) {
      special.push(group)
      continue
    }

    other.push(group)
  }

  return { farming, special, other }
}

function glyphForWorldSection(sectionKey: string): GlyphKind {
  if (sectionKey === 'merchants') return 'shop'
  if (sectionKey === 'houses') return 'house'
  return 'pin'
}

function CollapsibleGroup({
  groupKey,
  title,
  count,
  defaultOpen = true,
  children,
}: {
  groupKey: string
  title: string
  count: number
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="building-workspace-browser-group" data-open={open ? 'true' : 'false'} data-group={groupKey}>
      <button
        type="button"
        className="building-workspace-browser-group-hd"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="building-workspace-browser-group-chev" aria-hidden="true">
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
        <span className="building-workspace-browser-group-label">{title}</span>
        <span className="building-workspace-browser-count">{count}</span>
      </button>
      <div className="building-workspace-browser-group-bd">{children}</div>
    </div>
  )
}

function CatalogRow({
  title,
  hint,
  meta,
  glyph,
  isActive,
  onSelect,
  onOpenInAuthoring,
  revealIndex,
}: {
  title: string
  hint: string
  meta: string | number | null
  glyph: GlyphKind
  isActive: boolean
  onSelect: () => void
  /** Only constructible buildings have a `Data/Buildings` record to author. */
  onOpenInAuthoring?: () => void
  revealIndex: number
}) {
  const copy = useBuildingsCopy()
  const Icon = GLYPH_ICON[glyph]
  const revealProps = getLoadingMotionChildRevealProps({
    index: revealIndex,
    className: cx('building-workspace-browser-row', isActive && 'building-workspace-browser-row-active'),
  })

  return (
    <div {...revealProps}>
      <button type="button" className="building-workspace-browser-row-main" aria-pressed={isActive} onClick={onSelect}>
        <span className="building-workspace-browser-glyph" aria-hidden="true">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        </span>
        <span className="building-workspace-browser-copy">
          <span className="building-workspace-browser-title">{title}</span>
          <span className="building-workspace-browser-meta">{hint}</span>
        </span>
        {meta != null && meta !== '' ? <span className="building-workspace-browser-count">{meta}</span> : <span />}
      </button>
      {onOpenInAuthoring ? (
        <button
          type="button"
          className="icon-button building-workspace-browser-row-jump"
          aria-label={copy.openInAuthoringAction}
          title={copy.openInAuthoringHint}
          onClick={onOpenInAuthoring}
        >
          <PenLine className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/** Building directory: collapsible groups, glyph rows, left-accent selection. */
export function BuildingBrowserPanel({
  constructibleGroups,
  filteredConstructibleGroups,
  worldBuildings,
  filteredWorldBuildings,
  browserSourceMode,
  onBrowserSourceModeChange,
  modBuildingGroups,
  activeModBuildingSelectionId,
  activeBuildingId,
  activeBuildingGroupKey,
  buildingFilter,
  onBuildingFilterChange,
  onSelectBuilding,
  onSelectModBuilding,
  onOpenBuildingInAuthoring,
}: BuildingBrowserPanelProps) {
  const copy = useBuildingsCopy()
  const worldSectionTitles: Record<string, string> = {
    merchants: copy.browserGroupMerchants,
    houses: copy.browserGroupHouses,
    other: copy.browserGroupOther,
    ungrouped: copy.browserGroupUngrouped,
  }
  const worldSectionTitle = (key: string) => worldSectionTitles[key] ?? copy.browserGroupUngrouped
  const filteredCount = filteredConstructibleGroups.length + filteredWorldBuildings.length
  const totalCount = constructibleGroups.length + worldBuildings.length
  const worldSections = buildWorldBuildingSections(filteredWorldBuildings)
  const constructibleSections = buildConstructibleSections(filteredConstructibleGroups)
  const merchantSection = worldSections.find((section) => section.key === 'merchants') ?? null
  const houseSection = worldSections.find((section) => section.key === 'houses') ?? null
  const otherSection = worldSections.find((section) => section.key === 'other') ?? null
  const extraWorldSections = worldSections.filter((section) => !new Set(['merchants', 'houses', 'other']).has(section.key))
  const farmCount = constructibleSections.farming.length + constructibleSections.special.length + constructibleSections.other.length

  return (
    <aside className="building-workspace-pane h-full">
      <div className="building-workspace-browser-head">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-(--text-tertiary)" />
          <input
            className="control-input border-transparent bg-(--bg-panel-muted) pl-9"
            value={buildingFilter}
            onChange={(event) => onBuildingFilterChange(event.target.value)}
            placeholder={copy.browserFilterPlaceholder}
            spellCheck={false}
          />
        </div>

        <div className="building-workspace-browser-source" role="group" aria-label={copy.browserTitle}>
          <button
            type="button"
            className="building-workspace-browser-source-btn"
            aria-pressed={browserSourceMode === 'original'}
            onClick={() => onBrowserSourceModeChange('original')}
          >
            {copy.browserSourceOriginal}
          </button>
          <button
            type="button"
            className="building-workspace-browser-source-btn"
            aria-pressed={browserSourceMode === 'mod'}
            onClick={() => onBrowserSourceModeChange('mod')}
          >
            {copy.browserSourceMod}
          </button>
        </div>
      </div>

      <div className="building-workspace-browser-body custom-scrollbar">
        {browserSourceMode === 'mod' ? (
          modBuildingGroups.length ? (
            modBuildingGroups.map((group, groupIndex) => (
              <CollapsibleGroup key={group.modPath} groupKey={group.modPath} title={group.modName} count={group.items.length}>
                {group.items.map((entry, itemIndex) => {
                  const { value: building, targets } = entry
                  return (
                    <CatalogRow
                      key={`${group.modId}:${building.key}`}
                      title={building.displayName}
                      hint={targets[0] ?? building.internalName}
                      meta={building.stageCount}
                      glyph="mod"
                      isActive={entry.selectionId === activeModBuildingSelectionId}
                      onSelect={() => onSelectModBuilding(entry)}
                      onOpenInAuthoring={
                        building.sourceKind === 'constructible' ? () => onOpenBuildingInAuthoring(building.key) : undefined
                      }
                      revealIndex={groupIndex + itemIndex}
                    />
                  )
                })}
              </CollapsibleGroup>
            ))
          ) : (
            <p className="building-workspace-empty-notice px-2">{copy.browserModEmpty}</p>
          )
        ) : filteredCount ? (
          <>
            {merchantSection?.items.length ? (
              <CollapsibleGroup groupKey="merchants" title={worldSectionTitle('merchants')} count={merchantSection.items.length}>
                {merchantSection.items.map((building, index) => (
                  <CatalogRow
                    key={building.key}
                    title={building.displayName}
                    hint={building.exteriorMapName ?? building.internalName}
                    meta={building.worldEntrances.length > 0 ? building.worldEntrances.length : null}
                    glyph={glyphForWorldSection('merchants')}
                    isActive={building.key === activeBuildingId}
                    onSelect={() => onSelectBuilding(building.key)}
                    revealIndex={index}
                  />
                ))}
              </CollapsibleGroup>
            ) : null}

            {houseSection?.items.length ? (
              <CollapsibleGroup groupKey="houses" title={worldSectionTitle('houses')} count={houseSection.items.length}>
                {houseSection.items.map((building, index) => (
                  <CatalogRow
                    key={building.key}
                    title={building.displayName}
                    hint={building.exteriorMapName ?? building.internalName}
                    meta={building.worldEntrances.length > 0 ? building.worldEntrances.length : null}
                    glyph={glyphForWorldSection('houses')}
                    isActive={building.key === activeBuildingId}
                    onSelect={() => onSelectBuilding(building.key)}
                    revealIndex={index}
                  />
                ))}
              </CollapsibleGroup>
            ) : null}

            {farmCount > 0 ? (
              <CollapsibleGroup groupKey="farm" title={copy.browserFarmBuildingsTitle} count={farmCount}>
                {constructibleSections.farming.length ? (
                  <>
                    <p className="building-workspace-browser-sub">{copy.browserSubsectionFarming}</p>
                    {constructibleSections.farming.map((group, index) => (
                      <CatalogRow
                        key={group.key}
                        title={group.displayName}
                        hint={group.entries.map((entry) => entry.displayName).join(' / ')}
                        meta={group.stageCount}
                        glyph="farm"
                        isActive={group.key === activeBuildingGroupKey}
                        onSelect={() => onSelectBuilding(group.rootEntry.key)}
                        onOpenInAuthoring={() => onOpenBuildingInAuthoring(group.rootEntry.key)}
                        revealIndex={index}
                      />
                    ))}
                  </>
                ) : null}
                {constructibleSections.special.length ? (
                  <>
                    <p className="building-workspace-browser-sub">{copy.browserSubsectionSpecial}</p>
                    {constructibleSections.special.map((group, index) => (
                      <CatalogRow
                        key={group.key}
                        title={group.displayName}
                        hint={group.entries.map((entry) => entry.displayName).join(' / ')}
                        meta={group.stageCount}
                        glyph="spark"
                        isActive={group.key === activeBuildingGroupKey}
                        onSelect={() => onSelectBuilding(group.rootEntry.key)}
                        onOpenInAuthoring={() => onOpenBuildingInAuthoring(group.rootEntry.key)}
                        revealIndex={index}
                      />
                    ))}
                  </>
                ) : null}
                {constructibleSections.other.length ? (
                  <>
                    <p className="building-workspace-browser-sub">{copy.browserSubsectionAdditional}</p>
                    {constructibleSections.other.map((group, index) => (
                      <CatalogRow
                        key={group.key}
                        title={group.displayName}
                        hint={group.entries.map((entry) => entry.displayName).join(' / ')}
                        meta={group.stageCount}
                        glyph="farm"
                        isActive={group.key === activeBuildingGroupKey}
                        onSelect={() => onSelectBuilding(group.rootEntry.key)}
                        onOpenInAuthoring={() => onOpenBuildingInAuthoring(group.rootEntry.key)}
                        revealIndex={index}
                      />
                    ))}
                  </>
                ) : null}
              </CollapsibleGroup>
            ) : null}

            {otherSection?.items.length ? (
              <CollapsibleGroup groupKey="other" title={worldSectionTitle('other')} count={otherSection.items.length} defaultOpen={false}>
                {otherSection.items.map((building, index) => (
                  <CatalogRow
                    key={building.key}
                    title={building.displayName}
                    hint={building.exteriorMapName ?? building.internalName}
                    meta={building.worldEntrances.length > 0 ? building.worldEntrances.length : null}
                    glyph="pin"
                    isActive={building.key === activeBuildingId}
                    onSelect={() => onSelectBuilding(building.key)}
                    revealIndex={index}
                  />
                ))}
              </CollapsibleGroup>
            ) : null}

            {extraWorldSections.map((section) => (
              <CollapsibleGroup
                key={section.key}
                groupKey={section.key}
                title={worldSectionTitle(section.key)}
                count={section.items.length}
                defaultOpen={false}
              >
                {section.items.map((building, index) => (
                  <CatalogRow
                    key={building.key}
                    title={building.displayName}
                    hint={building.exteriorMapName ?? building.internalName}
                    meta={building.worldEntrances.length > 0 ? building.worldEntrances.length : null}
                    glyph={glyphForWorldSection(section.key)}
                    isActive={building.key === activeBuildingId}
                    onSelect={() => onSelectBuilding(building.key)}
                    revealIndex={index}
                  />
                ))}
              </CollapsibleGroup>
            ))}
          </>
        ) : (
          <p className="building-workspace-empty-notice px-2">{totalCount ? copy.browserFilteredEmpty : copy.browserUnloadedEmpty}</p>
        )}
      </div>
    </aside>
  )
}
