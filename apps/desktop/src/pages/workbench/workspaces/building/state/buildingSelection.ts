import { useMemo } from 'react'
import type { BuildingWorkspaceEntry, ConstructibleBuildingGroup } from '@entities/building'

/**
 * Compute the active building through the fallback chain:
 * 1. Active building entry if still in entries
 * 2. First filtered constructible group root
 * 3. First filtered world building
 * 4. First constructible group root
 * 5. First world building
 * 6. null
 */
export function useActiveBuildingFallback(
  activeBuildingId: string | null,
  buildingEntries: BuildingWorkspaceEntry[],
  filteredConstructibleGroups: ConstructibleBuildingGroup[],
  filteredWorldBuildings: BuildingWorkspaceEntry[],
  constructibleGroups: ConstructibleBuildingGroup[],
  worldBuildings: BuildingWorkspaceEntry[],
) {
  return useMemo(
    () =>
      buildingEntries.find((building) => building.key === activeBuildingId) ??
      filteredConstructibleGroups[0]?.rootEntry ??
      filteredWorldBuildings[0] ??
      constructibleGroups[0]?.rootEntry ??
      worldBuildings[0] ??
      null,
    [activeBuildingId, buildingEntries, constructibleGroups, filteredConstructibleGroups, filteredWorldBuildings, worldBuildings],
  )
}
