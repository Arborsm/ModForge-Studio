import { Search } from 'lucide-react'
import type { ConstructibleBuildingGroup, BuildingWorkspaceEntry } from '../../../workspaces/building'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup } from '@pages/workbench/workspaces/mod'
import { useBuildingsCopy } from '@locales/localeContext'
import { cx } from '@shared/lib/cx'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { PanelEmptyState, PanelSection } from '@shared/ui/PanelSection'
import { BrowserSourceSwitch } from '@shared/ui/BrowserSourceSwitch'

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

const FARM_SPECIAL_GROUP_KEYS = new Set([
  'Desert Obelisk',
  'Earth Obelisk',
  'Gold Clock',
  'Island Obelisk',
  'Junimo Hut',
  'Water Obelisk',
])

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
}

function buildWorldBuildingSections(worldBuildings: BuildingWorkspaceEntry[]) {
  const sections = new Map<
    string,
    {
      key: string
      title: string
      order: number
      items: BuildingWorkspaceEntry[]
    }
  >()

  for (const building of worldBuildings) {
    const key = building.metadata.worldSeedGroupKey ?? 'ungrouped'
    const title = building.metadata.worldSeedGroupLabel ?? building.groupDisplayName
    const order = Number.parseInt(building.metadata.worldSeedGroupOrder ?? '999', 10)
    const existing = sections.get(key)
    if (existing) {
      existing.items.push(building)
      continue
    }

    sections.set(key, {
      key,
      title,
      order,
      items: [building],
    })
  }

  return Array.from(sections.values()).sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order
    }

    return left.title.localeCompare(right.title)
  })
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

function WorldBuildingButton({
  building,
  isActive,
  onSelect,
  badgeLabel,
}: {
  building: BuildingWorkspaceEntry
  isActive: boolean
  onSelect: () => void
  badgeLabel: string
}) {
  return (
    <button
      type="button"
      className={cx('asset-row w-full text-left', isActive && 'asset-row-active')}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{building.displayName}</p>
          <p className="truncate text-xs text-[var(--text-secondary)]">
            {building.exteriorMapName ?? building.internalName}
          </p>
        </div>
        <div className="shrink-0 text-right text-[11px] text-[var(--text-secondary)]">
          <p>{building.worldEntrances.length}</p>
          <p>{badgeLabel}</p>
        </div>
      </div>
    </button>
  )
}

function ConstructibleGroupButton({
  group,
  isActive,
  onSelect,
}: {
  group: ConstructibleBuildingGroup
  isActive: boolean
  onSelect: () => void
}) {
  const copy = useBuildingsCopy()
  return (
    <button
      type="button"
      className={cx('asset-row w-full text-left', isActive && 'asset-row-active')}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{group.displayName}</p>
          <p className="truncate text-xs text-[var(--text-secondary)]">
            {group.entries.map((entry) => entry.displayName).join(' / ')}
          </p>
        </div>
        <div className="shrink-0 text-right text-[11px] text-[var(--text-secondary)]">
          <p>{group.stageCount}</p>
          <p>{copy.browserConstructibleBadge}</p>
        </div>
      </div>
    </button>
  )
}

function SubsectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{title}</p>
      <span className="dock-chip shrink-0">{count}</span>
    </div>
  )
}

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
}: BuildingBrowserPanelProps) {
  const copy = useBuildingsCopy()
  const filteredCount = filteredConstructibleGroups.length + filteredWorldBuildings.length
  const totalCount = constructibleGroups.length + worldBuildings.length
  const worldSections = buildWorldBuildingSections(filteredWorldBuildings)
  const constructibleSections = buildConstructibleSections(filteredConstructibleGroups)
  const merchantSection = worldSections.find((section) => section.key === 'merchants') ?? null
  const houseSection = worldSections.find((section) => section.key === 'houses') ?? null
  const otherSection = worldSections.find((section) => section.key === 'other') ?? null
  const extraWorldSections = worldSections.filter((section) => !new Set(['merchants', 'houses', 'other']).has(section.key))

  return (
    <PanelFrame
      hideHeader
      title={copy.browserTitle}
      subtitle={copy.browserSubtitle}
      className="h-full"
      headerAction={
        <span className="dock-chip">
          {browserSourceMode === 'mod'
            ? modBuildingGroups.reduce((total, group) => total + group.items.length, 0)
            : filteredCount}
        </span>
      }
    >
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            className="control-input pl-9"
            value={buildingFilter}
            onChange={(event) => onBuildingFilterChange(event.target.value)}
            placeholder={copy.browserFilterPlaceholder}
            spellCheck={false}
          />
        </div>

        <BrowserSourceSwitch value={browserSourceMode} onChange={onBrowserSourceModeChange} />

        <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
          {browserSourceMode === 'mod' ? (
            modBuildingGroups.length ? (
              modBuildingGroups.map((group) => (
                <PanelSection
                  key={group.modPath}
                  title={group.modName}
                  subtitle="Modified building entries"
                  action={<span className="dock-chip shrink-0">{group.items.length}</span>}
                  bodyClassName="space-y-2"
                >
                  {group.items.map((entry) => {
                    const { value: building, targets } = entry
                    return (
                    <button
                      key={`${group.modId}:${building.key}`}
                      type="button"
                      className={cx('asset-row w-full text-left', entry.selectionId === activeModBuildingSelectionId && 'asset-row-active')}
                      onClick={() => onSelectModBuilding(entry)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{building.displayName}</p>
                          <p className="truncate text-xs text-[var(--text-secondary)]">{targets[0] ?? building.internalName}</p>
                        </div>
                        <div className="shrink-0 text-right text-[11px] text-[var(--text-secondary)]">
                          <p>{building.sourceKind === 'constructible' ? copy.browserConstructibleBadge : copy.browserWorldBadge}</p>
                          <p>{building.stageCount}</p>
                        </div>
                      </div>
                    </button>
                    )
                  })}
                </PanelSection>
              ))
            ) : (
              <PanelEmptyState>No modded buildings match the current filter.</PanelEmptyState>
            )
          ) : filteredCount ? (
            <>
              {merchantSection?.items.length ? (
                <PanelSection
                  title={merchantSection.title}
                  subtitle={copy.browserWorldSubtitle}
                  action={<span className="dock-chip shrink-0">{merchantSection.items.length}</span>}
                  bodyClassName="space-y-2"
                >
                  {merchantSection.items.map((building) => (
                    <WorldBuildingButton
                      key={building.key}
                      building={building}
                      isActive={building.key === activeBuildingId}
                      onSelect={() => onSelectBuilding(building.key)}
                      badgeLabel={copy.browserWorldBadge}
                    />
                  ))}
                </PanelSection>
              ) : null}

              {houseSection?.items.length ? (
                <PanelSection
                  title={houseSection.title}
                  subtitle={copy.browserWorldSubtitle}
                  action={<span className="dock-chip shrink-0">{houseSection.items.length}</span>}
                  bodyClassName="space-y-2"
                >
                  {houseSection.items.map((building) => (
                    <WorldBuildingButton
                      key={building.key}
                      building={building}
                      isActive={building.key === activeBuildingId}
                      onSelect={() => onSelectBuilding(building.key)}
                      badgeLabel={copy.browserWorldBadge}
                    />
                  ))}
                </PanelSection>
              ) : null}

              {constructibleSections.farming.length || constructibleSections.special.length || constructibleSections.other.length ? (
                <PanelSection
                  title="Farm Buildings"
                  subtitle={copy.browserConstructibleSubtitle}
                  action={
                    <span className="dock-chip shrink-0">
                      {
                        constructibleSections.farming.length +
                        constructibleSections.special.length +
                        constructibleSections.other.length
                      }
                    </span>
                  }
                  bodyClassName="space-y-3"
                >
                  {constructibleSections.farming.length ? (
                    <div className="space-y-2">
                      <SubsectionTitle title="Farming" count={constructibleSections.farming.length} />
                      {constructibleSections.farming.map((group) => (
                      <ConstructibleGroupButton
                          key={group.key}
                          group={group}
                          isActive={group.key === activeBuildingGroupKey}
                          onSelect={() => onSelectBuilding(group.rootEntry.key)}
                        />
                      ))}
                    </div>
                  ) : null}
                  {constructibleSections.special.length ? (
                    <div className="space-y-2">
                      <SubsectionTitle title="Special" count={constructibleSections.special.length} />
                      {constructibleSections.special.map((group) => (
                      <ConstructibleGroupButton
                          key={group.key}
                          group={group}
                          isActive={group.key === activeBuildingGroupKey}
                          onSelect={() => onSelectBuilding(group.rootEntry.key)}
                        />
                      ))}
                    </div>
                  ) : null}
                  {constructibleSections.other.length ? (
                    <div className="space-y-2">
                      <SubsectionTitle title="Additional" count={constructibleSections.other.length} />
                      {constructibleSections.other.map((group) => (
                      <ConstructibleGroupButton
                          key={group.key}
                          group={group}
                          isActive={group.key === activeBuildingGroupKey}
                          onSelect={() => onSelectBuilding(group.rootEntry.key)}
                        />
                      ))}
                    </div>
                  ) : null}
                </PanelSection>
              ) : null}

              {otherSection?.items.length ? (
                <PanelSection
                  title={otherSection.title}
                  subtitle={copy.browserWorldSubtitle}
                  action={<span className="dock-chip shrink-0">{otherSection.items.length}</span>}
                  bodyClassName="space-y-2"
                >
                  {otherSection.items.map((building) => (
                    <WorldBuildingButton
                      key={building.key}
                      building={building}
                      isActive={building.key === activeBuildingId}
                      onSelect={() => onSelectBuilding(building.key)}
                      badgeLabel={copy.browserWorldBadge}
                    />
                  ))}
                </PanelSection>
              ) : null}

              {extraWorldSections.map((section) => (
                <PanelSection
                  key={section.key}
                  title={section.title}
                  subtitle={copy.browserWorldSubtitle}
                  action={<span className="dock-chip shrink-0">{section.items.length}</span>}
                  bodyClassName="space-y-2"
                >
                  {section.items.map((building) => (
                    <WorldBuildingButton
                      key={building.key}
                      building={building}
                      isActive={building.key === activeBuildingId}
                      onSelect={() => onSelectBuilding(building.key)}
                      badgeLabel={copy.browserWorldBadge}
                    />
                  ))}
                </PanelSection>
              ))}
            </>
          ) : (
            <PanelEmptyState>
              {totalCount ? copy.browserFilteredEmpty : copy.browserUnloadedEmpty}
            </PanelEmptyState>
          )}
        </div>
      </div>
    </PanelFrame>
  )
}

