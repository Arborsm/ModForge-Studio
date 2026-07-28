/**
 * Layer a world building is listed under.
 *
 * Farm buildings are deliberately absent: those come from `Data/Buildings` via
 * `createConstructibleBuildingGroups`, not from map warps, and the browser
 * renders them from that source instead.
 */
export type BuildingLocationSeedGroup = 'merchants' | 'houses' | 'other'

export type BuildingLocationSeed = {
  group: BuildingLocationSeedGroup
  name: string
  label: string
  locationName?: string | null
  mapAssetName?: string | null
  typeName?: string | null
  formerNames?: string[]
  allowOutdoor?: boolean
}

/** Render order of the world-building layers; the browser titles them from the dictionary. */
export const BUILDING_LOCATION_SEED_GROUP_ORDER: Record<BuildingLocationSeedGroup, number> = {
  merchants: 0,
  houses: 1,
  other: 3,
}

export const BUILDING_LOCATION_SEED_GROUPS: Record<BuildingLocationSeedGroup, BuildingLocationSeed[]> = {
  merchants: [
    { group: 'merchants', name: 'abandoned-house', label: 'Abandoned House', mapAssetName: 'Maps/Forest', allowOutdoor: true },
    { group: 'merchants', name: 'adventure-guild', label: "Adventurer's Guild", locationName: 'AdventureGuild' },
    { group: 'merchants', name: 'blacksmith', label: 'Blacksmith', locationName: 'Blacksmith' },
    { group: 'merchants', name: 'bookseller', label: 'Bookseller', mapAssetName: 'Maps/Town', allowOutdoor: true },
    { group: 'merchants', name: 'carpenters-shop', label: "Carpenter's Shop", locationName: 'ScienceHouse' },
    { group: 'merchants', name: 'casino', label: 'Casino', locationName: 'Club' },
    { group: 'merchants', name: 'desert-trader', label: 'Desert Trader', mapAssetName: 'Maps/Desert', allowOutdoor: true },
    { group: 'merchants', name: 'fish-shop', label: 'Fish Shop', locationName: 'FishShop' },
    {
      group: 'merchants',
      name: 'giant-stump',
      label: 'Giant Stump',
      locationName: 'Woods',
      mapAssetName: 'Maps/Woods',
      allowOutdoor: true,
    },
    { group: 'merchants', name: 'harveys-clinic', label: "Harvey's Clinic", locationName: 'Hospital' },
    { group: 'merchants', name: 'ice-cream-stand', label: 'Ice Cream Stand', mapAssetName: 'Maps/Town', allowOutdoor: true },
    { group: 'merchants', name: 'island-trader', label: 'Island Trader', mapAssetName: 'Maps/Island_N_Trader', allowOutdoor: true },
    { group: 'merchants', name: 'jojamart', label: 'JojaMart', locationName: 'JojaMart' },
    { group: 'merchants', name: 'marnies-ranch', label: "Marnie's Ranch", locationName: 'AnimalShop' },
    { group: 'merchants', name: 'oasis', label: 'Oasis', locationName: 'SandyHouse' },
    { group: 'merchants', name: 'pierres-general-store', label: "Pierre's General Store", locationName: 'SeedShop' },
    { group: 'merchants', name: 'qi-walnut-room', label: "Qi's Walnut Room", locationName: 'QiNutRoom' },
    { group: 'merchants', name: 'stardrop-saloon', label: 'The Stardrop Saloon', locationName: 'Saloon' },
    { group: 'merchants', name: 'traveling-cart', label: 'Traveling Cart', mapAssetName: 'Maps/Forest', allowOutdoor: true },
    { group: 'merchants', name: 'volcano-dwarf', label: 'Volcano Dwarf', mapAssetName: 'Maps/Caldera', allowOutdoor: true },
    { group: 'merchants', name: 'wizards-tower', label: "Wizard's Tower", locationName: 'WizardHouse' },
  ],
  houses: [
    { group: 'houses', name: '1-river-road', label: '1 River Road', locationName: 'JoshHouse' },
    { group: 'houses', name: '2-river-road', label: '2 River Road', locationName: 'Trailer_Big', formerNames: ['Trailer'] },
    { group: 'houses', name: '1-willow-lane', label: '1 Willow Lane', locationName: 'SamHouse' },
    { group: 'houses', name: '2-willow-lane', label: '2 Willow Lane', locationName: 'HaleyHouse' },
    { group: 'houses', name: '24-mountain-road', label: '24 Mountain Road', locationName: 'ScienceHouse' },
    { group: 'houses', name: 'elliotts-cabin', label: "Elliott's Cabin", locationName: 'ElliottHouse' },
    { group: 'houses', name: 'farmhouse', label: 'Farmhouse', locationName: 'FarmHouse' },
    { group: 'houses', name: 'island-farmhouse', label: 'Island Farmhouse', locationName: 'IslandFarmHouse' },
    { group: 'houses', name: 'leahs-cottage', label: "Leah's Cottage", locationName: 'LeahHouse' },
    { group: 'houses', name: 'mayors-manor', label: "Mayor's Manor", locationName: 'ManorHouse' },
    { group: 'houses', name: 'tent', label: 'Tent', locationName: 'Tent' },
    { group: 'houses', name: 'trailer', label: 'Trailer', locationName: 'Trailer' },
    { group: 'houses', name: 'treehouse', label: 'Treehouse', locationName: 'LeoTreeHouse' },
  ],
  other: [
    { group: 'other', name: 'community-center', label: 'Community Center', locationName: 'CommunityCenter' },
    { group: 'other', name: 'dog-pen', label: 'Dog Pen', mapAssetName: 'Maps/Town-DogHouse', allowOutdoor: true },
    { group: 'other', name: 'island-field-office', label: 'Island Field Office', locationName: 'IslandFieldOffice' },
    { group: 'other', name: 'joja-warehouse', label: 'Joja Warehouse', mapAssetName: 'Maps/CommunityCenter_Joja' },
    { group: 'other', name: 'movie-theater', label: 'Movie Theater', locationName: 'MovieTheater' },
    { group: 'other', name: 'museum', label: 'Museum', locationName: 'ArchaeologyHouse' },
    { group: 'other', name: 'spa', label: 'Spa', locationName: 'BathHouse_Entry' },
    { group: 'other', name: 'witchs-hut', label: "Witch's Hut", locationName: 'WitchHut' },
  ],
}

export const BUILDING_LOCATION_SEEDS = Object.values(BUILDING_LOCATION_SEED_GROUPS).flat()
