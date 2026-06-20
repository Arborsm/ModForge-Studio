import { useDeferredValue, useState, type ReactNode } from 'react'
import { localeBundles } from '@locales'
import { LocaleProvider } from '@locales/provider'
import { CpMakerPortContext } from '@features/cp-maker/model/cpMakerPortContext'
import type { CpMakerPort } from '@features/cp-maker/model/cpMakerPort'
import { LauncherPortContext } from '@features/launcher/model/launcherPortContext'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
import type { LauncherLibraryState } from '@features/launcher/model/launcherContracts'
import { LauncherPage } from '@pages/launcher/LauncherPage'
import { StudioDesk } from '@features/cp-maker'
import type { StudioDeskGalleryProject, StudioDeskInspiration, StudioDeskModel, StudioDeskWorldBibleModel } from '@features/cp-maker'
import { EventPatchEditor } from '@pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventPatchEditor'
import ItemWorkspace from '@pages/workbench/workspaces/item/view/ItemWorkspace'
import type { ItemTextureAssetState, ItemWorkspaceEntry } from '@pages/workbench/workspaces/item/entities/item'
import BuildingWorkspace from '@pages/workbench/workspaces/building/view/BuildingWorkspace'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry } from '@pages/workbench/workspaces/building/entities/building'
import { MapPatchEditor } from '@pages/workbench/workspaces/map/editors/MapPatchEditor'
import { ContentPatcherWorkspace } from '@pages/workbench/workspaces/mod/mods/content-patcher/content-view/ContentPatcherWorkspace'
import type { ContentPatcherBackendSimulationContext } from '@pages/workbench/workspaces/mod/mods/content-patcher/content-model/contentPatcher'
import type { ContentPatcherSimulationResult, LoadContentPatcherResultAssetResult, ModProjectDetail } from '@entities/mod/api'
import type { CpMakerDraft, DraftPatch, WorkspaceId } from '@shared/contracts'
import type { LauncherPage as LauncherPageId } from '@locales/api'

type PageScenarioId =
  | 'workbench-home'
  | 'event-stage-editor'
  | 'item-workspace'
  | 'building-workspace'
  | 'map-patch-editor'
  | 'content-patcher-workspace'
  | 'launcher-shell'

const pageScenarioIds: PageScenarioId[] = [
  'workbench-home',
  'event-stage-editor',
  'item-workspace',
  'building-workspace',
  'map-patch-editor',
  'content-patcher-workspace',
  'launcher-shell',
]

const copy = localeBundles['en-US']
const editorCopy = copy.editor
const accentColor = '#f97316'
const noop = () => {}
const asyncNoop = async () => {}

function range(count: number) {
  return Array.from({ length: count }, (_, index) => index)
}

function workspaceFor(index: number): WorkspaceId {
  return ['events', 'map', 'characters', 'buildings', 'items', 'mods'][index % 6] as WorkspaceId
}

function createWorldBible(count: number): StudioDeskWorldBibleModel {
  const makeEntries = (prefix: string) =>
    range(count).map((index) => ({
      key: `${prefix}.${index}`,
      value: `Generated ${prefix} reference ${index} with searchable performance fixture content`,
    }))

  return {
    configSchema: makeEntries('config'),
    tokens: makeEntries('token'),
    customLocations: makeEntries('location'),
    actors: makeEntries('actor'),
    story: makeEntries('story'),
    items: makeEntries('item'),
    scenes: makeEntries('scene'),
    conflictCount: Math.floor(count / 16),
  }
}

function createInspirations(count: number): StudioDeskInspiration[] {
  return range(count).map((index) => ({
    patchId: `patch-${index}`,
    kind: index % 4 === 0 ? 'event' : index % 4 === 1 ? 'map' : index % 4 === 2 ? 'asset' : 'project',
    title: `Storyboard performance beat ${index}`,
    target: `Maps/PerformanceTown${index % 40}`,
    action: index % 2 === 0 ? 'EditData' : 'EditMap',
    updatedAt: Date.now() - index * 120_000,
    status: index % 6 === 0 ? 'modified' : 'synced',
    workspaceId: workspaceFor(index),
  }))
}

function createGalleryProjects(count: number): StudioDeskGalleryProject[] {
  const tones: StudioDeskGalleryProject['coverTone'][] = ['festival', 'harbor', 'market', 'forest', 'greenhouse', 'archive']
  return range(count).map((index) => ({
    draftStorageKey: `page-perf-draft-${index}`,
    title: `Page performance content pack ${index}`,
    uniqueId: `ModForge.PagePerformance.${index}`,
    lastEditedAt: Date.now() - index * 90_000,
    lastExportedAt: index % 5 === 0 ? null : Date.now() - index * 180_000,
    isCurrent: index === 0,
    statuses: index % 9 === 0 ? ['conflict'] : ['export'],
    searchText: `page performance content pack ${index} ModForge.PagePerformance.${index}`,
    coverTone: tones[index % tones.length],
    conflictCount: index % 9 === 0 ? 3 : 0,
    needsMetadata: index % 14 === 0,
  }))
}

function createStudioDeskModel(count: number): StudioDeskModel {
  const galleryProjects = createGalleryProjects(count)
  return {
    projectName: 'Page Performance Pack',
    projectDescription: 'Dev-only page performance fixture',
    projectAuthor: 'ModForge',
    projectVersion: '1.0.0',
    projectUniqueId: 'ModForge.PagePerformance',
    hasActiveDraft: true,
    draftSummaries: [],
    gallery: {
      projects: galleryProjects,
      counts: {
        all: galleryProjects.length,
      },
    },
    recentInspirations: createInspirations(count),
    workspaceEntrypoints: [],
    stats: {
      eventCount: count,
      mapCount: Math.floor(count / 3),
      festivalCount: Math.floor(count / 8),
      assetCount: Math.floor(count / 2),
      conflictCount: Math.floor(count / 10),
    },
    worldBible: createWorldBible(Math.max(64, Math.floor(count / 3))),
    exportSummary: {
      lastExportedAt: Date.now() - 240_000,
      fileList: range(96).map((index) => `content/page-perf-${index}.json`),
    },
  }
}

function createDraftPatch(index: number, workspace: WorkspaceId = workspaceFor(index)): DraftPatch {
  const actions: DraftPatch['action'][] = ['EditData', 'EditImage', 'EditMap', 'Load', 'Include']
  return {
    id: `patch-${index}`,
    workspace,
    target: workspace === 'events' ? 'Data/Events/Town' : `Data/PerformanceTarget${index % 80}`,
    action: workspace === 'events' ? 'EditData' : actions[index % actions.length],
    logName: `Page performance patch ${index}`,
    enabled: index % 7 !== 0,
    updatedAt: Date.now() - index * 60_000,
    fromFile: index % 4 === 0 ? `assets/generated/${index}.json` : undefined,
    when: index % 3 === 0 ? { Season: 'spring', HasSeenEvent: `${700000 + index}` } : undefined,
    editorState: {},
  }
}

function createCpMakerDraft(patches: DraftPatch[] = []): CpMakerDraft {
  return {
    draftStorageKey: 'page-performance-draft',
    projectMetadata: {
      projectName: 'Page Performance Pack',
      projectDescription: 'Dev-only page performance fixture',
      projectAuthor: 'ModForge',
      projectVersion: '1.0.0',
      projectUniqueId: 'ModForge.PagePerformance',
      gameRootPath: null,
      contentPackForUniqueId: 'Pathoschild.ContentPatcher',
      minimumApiVersion: '2.7.0',
      updateKeys: ['Nexus:900001'],
    },
    overlayTargets: [],
    configSchema: [],
    patches,
    virtualAssets: [],
    dynamicTokens: [],
    customLocations: [],
    aliasTokenNames: {},
    eventSourceSnapshotsByTarget: {},
  }
}

function createEventPatch(count: number) {
  const entries = Object.fromEntries(
    range(count).map((index) => [
      `${900000 + index}/Season spring/Time ${900 + (index % 6) * 100} ${1400 + (index % 4) * 100}`,
      [
        `farmer ${12 + (index % 10)} 47 0 Abigail 12 45 2 Lewis 16 45 3`,
        'skippable',
        'viewport 12 45',
        `speak Abigail "Performance event ${index} with enough command text to stress parsing."`,
        'move Abigail 1 0 1 Abigail 0 1 2 Abigail -1 0 3',
        'faceDirection Lewis 3',
        'emote Lewis 16',
        'addItem "(O)24" 1',
        'message "You received a page-performance parsnip."',
        'end dialogue',
      ].join('/'),
    ]),
  )

  const fields = Object.fromEntries(
    Object.keys(entries)
      .slice(0, 24)
      .map((key, index) => [
        key,
        {
          alias: `Performance alias ${index}`,
          location: index % 2 === 0 ? 'Town' : 'Beach',
        },
      ]),
  )

  return {
    ...createDraftPatch(0, 'events'),
    editorState: {
      entries,
      fields,
      moveEntries: range(16).map((index) => ({
        id: `${900000 + index}`,
        afterId: index > 0 ? `${900000 + index - 1}` : undefined,
      })),
      textOperations: [
        {
          operation: 'Append',
          target: ['Data/Events/Town'],
          value: 'New event line',
          delimiter: '/',
        },
      ],
    },
  } satisfies DraftPatch
}

function createItemEntry(index: number): ItemWorkspaceEntry {
  const kind = index % 7 === 0 ? 'weapon' : index % 5 === 0 ? 'furniture' : index % 3 === 0 ? 'big-craftable' : 'object'
  const category = index % 6 === 0 ? 'fish' : index % 5 === 0 ? 'furniture' : index % 4 === 0 ? 'crafting' : 'crop'
  const qualifiedItemId = `(O)${index + 1000}`
  const recipe = {
    key: `recipe-${index}`,
    displayName: `Recipe ${index}`,
    kind: index % 2 === 0 ? 'crafting' : 'cooking',
    ingredients: [
      {
        key: `ingredient-${index}`,
        kind: 'item',
        qualifiedItemId: `(O)${index + 500}`,
        displayName: `Ingredient ${index}`,
        amount: 2 + (index % 4),
        category: null,
      },
    ],
    outputQualifiedItemId: qualifiedItemId,
    outputCount: 1,
    outputIsBigCraftable: kind === 'big-craftable',
    unlockType: 'skill',
    unlockLabel: `Level ${index % 10}`,
  } satisfies ItemWorkspaceEntry['recipesProduced'][number]

  return {
    key: `item-${index}`,
    qualifiedItemId,
    itemId: String(index + 1000),
    rawDisplayName: `Performance Item ${index}`,
    displayName: `Performance Item ${index}`,
    rawDescription: `Generated item fixture ${index}`,
    description: `Generated item fixture ${index} with searchable text and relation data.`,
    internalName: `PerfItem${index}`,
    kind,
    category: index % 3 === 0 ? -75 : null,
    rawType: category,
    kindMetaLabel: kind,
    textureAssetName: index % 2 === 0 ? 'Maps/springobjects' : null,
    texturePathLabel: 'Content/Maps/springobjects.xnb',
    spriteIndex: index % 64,
    menuSpriteIndex: index % 64,
    spriteWidth: 16,
    spriteHeight: 16,
    price: 80 + index,
    salePrice: 40 + index,
    edibility: index % 4 === 0 ? 18 : null,
    isDrink: index % 13 === 0,
    canBeGivenAsGift: true,
    canBeTrashed: index % 11 !== 0,
    searchText: `performance item ${index} generated ${kind} ${category}`,
    browseCategories: ['all', category],
    categorySearchTokens: [category, kind],
    contextTags: [`tag-${index % 8}`, `family-${index % 12}`],
    customFields: {
      Source: 'PagePerformance',
      Index: String(index),
    },
    objectStats: null,
    cropData: null,
    cropHarvests: [],
    fishData: null,
    fishCatchLocations: [],
    recipesProduced: index % 4 === 0 ? [recipe] : [],
    recipesUsing: index % 5 === 0 ? [recipe] : [],
    shopEntries: [],
    shopRecipeEntries: [],
    machineOutputs: [],
    machineInputs: [
      {
        machineQualifiedItemId: '(BC)12',
        machineDisplayName: 'Performance Machine',
        machineRuleId: `machine-${index}`,
        triggerLabel: 'Input',
        requiredItemQualifiedId: qualifiedItemId,
        requiredItemCount: 1,
        requiredTags: [`tag-${index % 8}`],
        outputItemQualifiedId: `(O)${index + 1200}`,
        outputCount: 1,
        minutesUntilReady: 60 + index,
        daysUntilReady: 0,
        condition: null,
      },
    ],
    artifactSpotSources: [],
    forageSources: [],
    fishPondSources: [],
    fishPondProfile: null,
    lovedBy: range(index % 6).map((npc) => ({ internalName: `NPC${npc}`, displayName: `NPC ${npc}`, taste: 'love' })),
    likedBy: range(index % 4).map((npc) => ({ internalName: `Friend${npc}`, displayName: `Friend ${npc}`, taste: 'like' })),
    weaponStats:
      kind === 'weapon'
        ? {
            minDamage: 12,
            maxDamage: 28,
            knockback: 1,
            speed: 2,
            precision: 0,
            defense: 0,
            critChance: 0.04,
            critMultiplier: 3,
            mineBaseLevel: 10,
            mineMinLevel: 0,
            areaOfEffect: 0,
          }
        : null,
    toolStats: null,
    apparelStats: null,
    placementStats: kind === 'big-craftable' ? { fragility: 0, canBePlacedOutdoors: true, canBePlacedIndoors: true, isLamp: false } : null,
    trinketStats: null,
    hatStats: null,
    footwearStats: null,
    furnitureStats:
      kind === 'furniture'
        ? {
            furnitureType: 'chair',
            rotations: 4,
            sourceSize: { width: 16, height: 32 },
            boundingSize: { width: 1, height: 2 },
          }
        : null,
  }
}

function createBuildingStage(index: number, stageCount: number): BuildingWorkspaceEntry {
  const key = `performance-building-${index}`
  return {
    sourceKind: 'constructible',
    key,
    groupKey: 'performance-building',
    groupDisplayName: 'Performance Barn',
    rawDisplayName: `Performance Barn ${index + 1}`,
    displayName: `Performance Barn ${index + 1}`,
    rawGeneralTypeDisplayName: 'Performance Barn',
    generalTypeDisplayName: 'Performance Barn',
    rawDescription: `Generated building stage ${index + 1}`,
    description: `Generated building stage ${index + 1} with materials, skins, and upgrade-chain fixture data.`,
    internalName: key,
    searchText: `performance barn stage ${index}`,
    textureAssetName: 'Buildings/Barn',
    texturePathLabel: 'Content/Buildings/Barn.xnb',
    sourceRect: { X: 0, Y: index * 64, Width: 96, Height: 96 },
    drawShadow: true,
    upgradeSignTile: { X: 1, Y: 2 },
    upgradeSignHeight: 16,
    size: { X: 7 + index, Y: 4 + index },
    fadeWhenBehind: true,
    seasonOffset: null,
    drawOffset: { X: 0, Y: -16 },
    sortTileOffset: 0,
    collisionMap: null,
    additionalPlacementTiles: [],
    buildingClassName: 'Barn',
    builder: 'Robin',
    buildCondition: null,
    buildDays: 3 + index,
    buildCost: 6000 + index * 3500,
    buildMaterials: range(5).map((material) => ({
      itemId: String(388 + material),
      displayName: `Material ${material}`,
      amount: 50 + material * 25,
      objectIndex: 388 + material,
    })),
    upgradeFromKey: index > 0 ? `performance-building-${index - 1}` : null,
    upgradeToKeys: index < stageCount - 1 ? [`performance-building-${index + 1}`] : [],
    magicalConstruction: false,
    buildMenuDrawOffset: null,
    humanDoor: { X: 3, Y: 4 },
    animalDoor: { X: 4, Y: 4, Width: 2, Height: 1 },
    animalDoorOpenDuration: 300,
    animalDoorOpenSound: 'doorClose',
    animalDoorCloseDuration: 300,
    animalDoorCloseSound: 'doorCreak',
    nonInstancedIndoorLocation: null,
    indoorMapAssetName: 'Maps/Barn',
    indoorMapPathLabel: 'Content/Maps/Barn.xnb',
    indoorMapType: 'default',
    exteriorMapAssetName: null,
    exteriorMapPathLabel: null,
    exteriorMapName: null,
    exteriorEntryTile: null,
    worldEntrances: [],
    maxOccupants: 4 + index * 4,
    validOccupantTypes: ['Cow', 'Goat', 'Sheep'],
    allowAnimalPregnancy: true,
    indoorItemMoves: [],
    indoorItems: [],
    addMailOnBuild: ['performanceBarnBuilt'],
    metadata: {},
    modData: {},
    hayCapacity: 240 + index * 120,
    chests: [],
    defaultAction: null,
    additionalTilePropertyRadius: 0,
    allowsFlooringUnderneath: true,
    actionTiles: [],
    tileProperties: [],
    itemConversions: [],
    drawLayers: [],
    customFields: {},
    skins: range(4).map((skin) => ({
      id: `skin-${skin}`,
      displayName: `Seasonal Skin ${skin + 1}`,
      generalTypeDisplayName: 'Performance Barn',
      description: `Skin fixture ${skin + 1}`,
      textureAssetName: 'Buildings/Barn',
      texturePathLabel: 'Content/Buildings/Barn.xnb',
      condition: skin % 2 === 0 ? 'SEASON spring' : null,
      buildDays: null,
      buildCost: null,
      buildMaterials: [],
      showAsSeparateConstructionEntry: skin % 2 === 0,
      metadata: {},
    })),
    upgradeChainKeys: range(stageCount).map((stage) => `performance-building-${stage}`),
    stageIndex: index,
    stageCount,
    rootKey: 'performance-building-0',
    leafKey: `performance-building-${stageCount - 1}`,
  }
}

function createSimulationContext(): ContentPatcherBackendSimulationContext {
  return {
    season: 'spring',
    weather: 'sunny',
    day: 12,
    dayOfWeek: 'Friday',
    daysPlayed: 42,
    year: 2,
    time: 1330,
    playerName: 'Performance',
    playerGender: 'female',
    farmName: 'Frame Farm',
    locationName: 'Town',
    spouse: '',
    isMainPlayer: true,
    stardropCount: 3,
    hasFlags: ['cc_Bridge'],
    hasSeenEvents: ['900001'],
    hasConversationTopics: [],
    hasDialogueAnswers: [],
    hasWalletItems: ['SkullKey'],
    hasProfessions: ['Tiller'],
    hasCraftingRecipes: ['Chest'],
    hasCookingRecipes: ['Omelet'],
    skillLevels: { Farming: 10, Mining: 6, Fishing: 4 },
    hasActiveQuests: [],
    hasCompletedQuests: ['13'],
    hasItems: ['(O)24'],
    hasPet: true,
    petType: 'Cat',
    hasChildren: false,
    childCount: 0,
    dailyLuck: 0.04,
    hasCaughtFish: ['128'],
    hasReadLetters: ['spring_12_1'],
    hasVisitedLocations: ['Town', 'Beach'],
    isOutdoors: true,
    locationContext: 'Town',
    locationUniqueName: 'Town',
    locationOwnerId: '',
    preferredPet: 'Cat',
    farmCave: 'Bats',
    farmMapAsset: 'Farm',
    havingChild: false,
    pregnant: false,
    roommate: '',
    hearts: { Abigail: 8, Lewis: 4 },
    childNames: [],
    childGenders: [],
    dayEvent: '',
    farmType: 'Standard',
    farmhouseUpgrade: 2,
    isCommunityCenterComplete: false,
    isJojaMartComplete: false,
    language: 'en',
    relationships: { Abigail: 'Friend' },
    config: { Variant: 'festival', HardMode: false },
    installedMods: ['Pathoschild.ContentPatcher'],
    customTokens: { PerformanceToken: 'Enabled' },
    ignoreEntryWhenConditions: false,
  }
}

function createContentPatcherProjectDetail(changeCount: number): ModProjectDetail {
  return {
    pluginKind: 'content-patcher',
    capabilities: ['content-patcher'],
    summary: {
      id: 'page-performance-project',
      name: 'Page Performance Content Pack',
      author: 'ModForge',
      version: '1.0.0',
      description: 'Large content patcher fixture',
      uniqueId: 'ModForge.PagePerformanceContent',
      contentPackFor: 'Pathoschild.ContentPatcher',
      folderName: 'PagePerformanceContent',
      absolutePath: 'E:/Perf/PagePerformanceContent',
      manifestPath: 'E:/Perf/PagePerformanceContent/manifest.json',
      contentPath: 'E:/Perf/PagePerformanceContent/content.json',
      pluginKind: 'content-patcher',
      status: 'ready',
      missingRequiredDependencies: [],
    },
    diagnostics: [],
    contentPatcher: {
      manifestPath: 'E:/Perf/PagePerformanceContent/manifest.json',
      contentPath: 'E:/Perf/PagePerformanceContent/content.json',
      manifestJson: '{}',
      contentJson: '{}',
      format: '2.7.0',
      changeCount,
      includeCount: 6,
      dynamicTokenCount: 18,
      configKeys: ['Variant', 'HardMode', 'FestivalDay'],
      hasI18n: true,
      i18nFiles: [],
      patches: [],
    },
  } as ModProjectDetail
}

function createLauncherCatalogResults(count: number) {
  return range(count).map((index) => ({
    modId: 950000 + index,
    title: `Launcher Performance Mod ${index}`,
    summary: `Generated launcher discover result ${index}`,
    author: `Author ${index % 12}`,
    uploader: `Uploader ${index % 6}`,
    modUrl: `https://example.invalid/mods/${950000 + index}`,
    imageUrl: null,
    category: ['Gameplay Mechanics', 'Locations', 'Items', 'User Interface'][index % 4],
    createdAt: new Date(Date.now() - index * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - index * 43_200_000).toISOString(),
    downloads: 20_000 + index * 137,
    endorsements: 2_000 + index * 41,
    fileSize: 12_000_000 + index * 2048,
    updateAvailable: index % 9 === 0,
  }))
}

function createLauncherUpdateResults(count: number) {
  return range(count).map((index) => ({
    modId: 950000 + index,
    name: `Launcher Performance Mod ${index}`,
    author: `Author ${index % 12}`,
    currentVersion: `1.${index % 4}.0`,
    latestVersion: `2.${index % 5}.0`,
    absolutePath: `E:/ModForge Dev/Stardew Valley/Mods/PerformanceMod${index}`,
    modUrl: `https://example.invalid/mods/${950000 + index}`,
    imageUrl: null,
    updatedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
    fileSize: 12_000_000 + index * 2048,
  }))
}

function createLauncherLibraryMods(count: number) {
  return range(count).map((index) => ({
    id: `launcher-perf-mod-${index}`,
    labelKey: `ModForge.Performance.${index}`,
    name: `Launcher Library Mod ${index}`,
    author: `Author ${index % 12}`,
    version: `1.${index % 7}.0`,
    description: `Generated launcher library fixture ${index}`,
    uniqueId: `ModForge.Performance.${index}`,
    folderName: `PerformanceMod${index}`,
    absolutePath: `E:/ModForge Dev/Stardew Valley/Mods/PerformanceMod${index}`,
    enabled: index % 9 !== 0,
    nexusModId: 950000 + index,
    updateKeys: [`Nexus:${950000 + index}`],
    modUrl: `https://example.invalid/mods/${950000 + index}`,
    imageUrl: null,
    requiredDependencies: [],
    missingRequiredDependencies: [],
  }))
}

const launcherLibraryMods = createLauncherLibraryMods(120)
const launcherLibraryFolders = [
  ...range(12).map((index) => ({
    id: `launcher-perf-folder-${index}`,
    name: `Performance Folder ${index + 1}`,
    parentFolderId: null,
    modKeys: launcherLibraryMods
      .slice(index === 0 ? 0 : 24 + (index - 1) * 8, index === 0 ? 22 : 24 + index * 8)
      .map((mod) => mod.uniqueId),
    coverModKeys: [],
  })),
  {
    id: 'launcher-perf-folder-nested',
    name: 'Nested Performance Folder',
    parentFolderId: 'launcher-perf-folder-0',
    modKeys: launcherLibraryMods.slice(22, 24).map((mod) => mod.uniqueId),
    coverModKeys: [],
  },
]

const launcherSettings = {
  gamePath: 'E:\\ModForge Dev\\Stardew Valley',
  modsPath: 'E:\\ModForge Dev\\Stardew Valley\\Mods',
  downloadPath: 'E:\\ModForge Dev\\Downloads',
  nexusApiKey: 'perf-api-key',
  autoInstallDownloads: false,
  keepDownloadedArchives: false,
  autoCheckModUpdates: true,
}

const launcherDiagnostics = {
  routes: [
    {
      routeId: 'publicGraphql',
      label: 'Nexus Public GraphQL',
      endpoint: 'https://example.invalid/graphql',
      status: 'success',
      attempts: 1,
      maxAttempts: 3,
      available: true,
      message: 'Connected after 1 attempt.',
    },
    {
      routeId: 'nexusImages',
      label: 'Nexus image CDN',
      endpoint: 'https://example.invalid/images',
      status: 'success',
      attempts: 1,
      maxAttempts: 3,
      available: true,
      message: 'Connected.',
    },
    {
      routeId: 'nexusApi',
      label: 'Nexus REST API',
      endpoint: 'https://example.invalid/api',
      status: 'warning',
      attempts: 2,
      maxAttempts: 3,
      available: true,
      message: 'Slow but available.',
    },
  ],
}

const PERFORMANCE_LAUNCHER_LIBRARY_STATE_STORAGE_KEY = 'modforge.performanceLauncherLibraryState'

function createPerformanceLauncherLibraryState(): LauncherLibraryState {
  return {
    storageFolders: [],
    hiddenModKeys: [],
    packPresets: [],
    childModGroups: [{ parentModKey: 'ModForge.Performance.112', childModKeys: ['ModForge.Performance.113', 'ModForge.Performance.114'] }],
    libraryFolders: launcherLibraryFolders,
    customOrders: {},
    currentPackId: null,
    scopeMode: 'all',
  }
}

function loadPerformanceLauncherLibraryState(): LauncherLibraryState {
  try {
    const raw = window.sessionStorage.getItem(PERFORMANCE_LAUNCHER_LIBRARY_STATE_STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw) as LauncherLibraryState
    }
  } catch {
    window.sessionStorage.removeItem(PERFORMANCE_LAUNCHER_LIBRARY_STATE_STORAGE_KEY)
  }
  return createPerformanceLauncherLibraryState()
}

let performanceLauncherLibraryState: LauncherLibraryState | null = null

function getPerformanceLauncherLibraryState() {
  performanceLauncherLibraryState ??= loadPerformanceLauncherLibraryState()
  return performanceLauncherLibraryState
}

function savePerformanceLauncherLibraryState(state: LauncherLibraryState) {
  performanceLauncherLibraryState = state
  window.sessionStorage.setItem(PERFORMANCE_LAUNCHER_LIBRARY_STATE_STORAGE_KEY, JSON.stringify(state))
}

function exposePerformanceLauncherLibraryState(state: LauncherLibraryState) {
  window.__modforgeLauncherCustomSortState = {
    customOrders: state.customOrders,
    childModGroups: state.childModGroups,
  }
}

const performanceLauncherPort: LauncherPort = {
  loadSettings: async () => launcherSettings,
  saveSettings: async (request) => ({ ...launcherSettings, ...request }),
  scanLibrary: async () => ({ modsPath: launcherSettings.modsPath, mods: launcherLibraryMods }),
  loadRuntimeInfo: async () => ({ gameVersion: '1.6.15', smapiVersion: '4.3.0' }),
  loadLibraryState: async () => {
    const state = getPerformanceLauncherLibraryState()
    exposePerformanceLauncherLibraryState(state)
    return state
  },
  saveLibraryState: async (request) => {
    savePerformanceLauncherLibraryState(request)
    exposePerformanceLauncherLibraryState(request)
    return request
  },
  loadLibraryCovers: async () => ({ covers: [] }) as any,
  loadImageFailures: async () => ({ entries: [] }) as any,
  setLibraryCover: async () => ({ covers: [] }) as any,
  persistLibraryRemoteCover: async () => ({ covers: [] }) as any,
  loadDownloadQueue: async () => ({ items: [] }) as any,
  saveDownloadQueue: async (request) => request as any,
  searchCatalog: async (request) => {
    const pageSize = request.pageSize ?? 40
    const page = request.page ?? 1
    const allResults = createLauncherCatalogResults(180)
    const offset = (page - 1) * pageSize
    return {
      page,
      pageSize,
      totalCount: allResults.length,
      hasMore: offset + pageSize < allResults.length,
      facets: {
        categories: [
          { name: 'Gameplay Mechanics', count: 64 },
          { name: 'Locations', count: 48 },
          { name: 'Items', count: 38 },
          { name: 'User Interface', count: 30 },
        ],
        languages: [
          { name: 'English', count: 180 },
          { name: 'Chinese', count: 42 },
        ],
        tags: [
          { name: 'performance', count: 90 },
          { name: 'content-patcher', count: 76 },
          { name: 'maps', count: 51 },
        ],
      },
      results: allResults.slice(offset, offset + pageSize),
    } as any
  },
  loadRemoteModDetail: async (request) =>
    ({
      modId: request.modId,
      title: `Launcher Performance Mod ${request.modId}`,
      summary: 'Remote mod detail fixture',
      description: 'Large remote mod detail fixture\n'.repeat(40),
      author: 'ModForge',
      version: '2.0.0',
      modUrl: `https://example.invalid/mods/${request.modId}`,
      imageUrl: null,
      galleryImages: [],
      updatedAt: new Date().toISOString(),
      fileSize: 24_000_000,
      category: 'Gameplay Mechanics',
      downloads: 250_000,
      endorsements: 32_000,
      directDownloadEnabled: true,
      supportsVortex: true,
      primaryFileId: request.modId + 10,
      primaryFileName: 'Page performance mod.zip',
      primaryFileVersion: '2.0.0',
      primaryFileSize: 24_000_000,
      primaryFileSizeBytes: 24_000_000,
      primaryFileChangelog: range(12).map((index) => `Changelog entry ${index}`),
      requirements: range(8).map((index) => ({
        name: `Requirement ${index}`,
        notes: `Requirement note ${index}`,
        url: 'https://example.invalid/requirement',
        external: index % 3 === 0,
      })),
      files: range(20).map((index) => ({
        fileId: request.modId * 10 + index,
        name: `Performance file ${index}.zip`,
        version: `2.${index}.0`,
        category: index % 5 === 0 ? 'optional' : 'main',
        uploadedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
        description: `File description ${index}`,
        uniqueDownloads: 1000 + index,
        totalDownloads: 4000 + index,
        managerDownloadEnabled: true,
        size: 12_000_000 + index,
        sizeBytes: 12_000_000 + index,
        primary: index === 0,
        archiveType: 'zip',
        changelog: [`File changelog ${index}`],
      })),
    }) as any,
  loadUpdateChangelog: async (request) =>
    ({
      modId: request.modId,
      version: '2.0.0',
      changelog: 'Page performance changelog\n'.repeat(16),
    }) as any,
  loadNexusDiagnostics: async () => launcherDiagnostics as any,
  restartNexusDiagnostics: async () => launcherDiagnostics as any,
  retryNexusDiagnosticsRoute: async () => launcherDiagnostics as any,
  setNexusForceOffline: async () => launcherDiagnostics as any,
  resolveImage: async () => ({ sourceUrl: '', localPath: '', mimeType: '' }) as any,
  loadCachedUpdates: async () =>
    ({ modsPath: launcherSettings.modsPath, checkedAtMs: Date.now(), isComplete: true, updates: createLauncherUpdateResults(72) }) as any,
  loadSuppressedUpdateModIds: async () => ({ modsPath: launcherSettings.modsPath, modIds: [] }) as any,
  checkUpdates: async () =>
    ({ modsPath: launcherSettings.modsPath, checkedAtMs: Date.now(), isComplete: true, updates: createLauncherUpdateResults(72) }) as any,
  listenToUpdateProgress: async () => noop,
  downloadMod: async () =>
    ({ downloadId: 'page-performance-download', archivePath: null, installed: false, installedTargetPath: null, version: '2.0.0' }) as any,
  cancelDownload: async () => {},
  listenToDownloadProgress: async () => noop,
  installArchive: async () => ({ installedTargetPath: 'E:/ModForge Dev/Stardew Valley/Mods/PagePerformance', backupPath: null }) as any,
  listInstallBackups: async () => [] as any,
  restoreInstallBackup: async () => ({ restoredPath: 'E:/ModForge Dev/Stardew Valley/Mods/PagePerformance' }) as any,
  inspectArchive: async () => ({ archivePath: 'E:/ModForge Dev/Downloads/PagePerformance.zip', entries: [], rootDirectories: [] }) as any,
  launchGame: async () => ({ started: true, executablePath: 'E:/ModForge Dev/Stardew Valley/Stardew Valley.exe' }) as any,
  openPath: async () => {},
  openUrl: async () => {},
  clearLibraryReadCaches: noop,
  chooseArchiveFile: async () => null,
  chooseImageFile: async () => null,
  getBackupDirectory: async () => 'E:\\ModForge Dev\\Backups',
  setModEnabled: async (request) => ({ absolutePath: request.modPath, enabled: request.enabled }) as any,
  chooseDirectory: async () => null,
  detectDefaultGameDirectory: async () => launcherSettings.gamePath,
  toDesktopAssetUrl: (path) => path,
  subscribeUpdates: () => noop,
  validateNexusApiKey: async () =>
    ({
      userName: 'PerfUser',
      avatarUrl: null,
      profileUrl: null,
      isPremium: true,
      isLifetimePremium: true,
      premiumExpiresAt: null,
      dailyRemaining: 900,
      hourlyRemaining: 450,
      dailyResetAt: null,
      hourlyResetAt: null,
    }) as any,
  startNexusSso: async () => ({ ssoId: 'perf-sso', status: 'idle' }) as any,
  getNexusSsoStatus: async () =>
    ({
      status: 'authorized',
      errorKind: null,
      errorMessage: null,
      userName: 'PerfUser',
      isPremium: true,
      ssoId: 'perf-sso',
    }) as any,
  cancelNexusSso: async () => {},
}

const performanceCpMakerPort: CpMakerPort = {
  listDrafts: async () => [] as any,
  loadDraft: async (storageKey) =>
    ({
      draftStorageKey: storageKey,
      projectMetadata: {
        projectName: 'Page Performance Pack',
        projectDescription: 'Dev-only page performance fixture',
        projectAuthor: 'ModForge',
        projectVersion: '1.0.0',
        projectUniqueId: 'ModForge.PagePerformance',
        gameRootPath: null,
        contentPackForUniqueId: 'Pathoschild.ContentPatcher',
      },
      overlayTargets: [],
      configSchema: [],
      patches: [],
      virtualAssets: [],
      dynamicTokens: [],
      customLocations: [],
      aliasTokenNames: {},
      eventSourceSnapshotsByTarget: {},
    }) as any,
  saveDraft: async (draft) => draft as any,
  deleteDraft: async () => {},
  copyDraft: async (sourceDraftStorageKey) => ({ draftStorageKey: `${sourceDraftStorageKey}-copy` }) as any,
  importPack: async (modDirectoryPath) => ({ draftStorageKey: modDirectoryPath }) as any,
  exportPack: async (request) => ({ outputPath: request.output_path ?? '', archivePath: request.output_path ?? '' }) as any,
  chooseDirectory: async () => 'E:\\ModForge Dev\\Exports',
  scanMaps: async () => [] as any,
  scanEvents: async () => [] as any,
  scanModProjects: async () => [] as any,
  loadMapAsset: async () => ({ name: '', format: 'xnb', absolutePath: '', relativePath: '', content: '{}' }) as any,
  loadTextAsset: async () => ({ absolutePath: '', relativePath: '', content: '{}' }) as any,
  loadImageDataUrl: async () =>
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9nQ1YAAAAASUVORK5CYII=',
}

function ScenarioFrame({ id, children }: { id: PageScenarioId; children: ReactNode }) {
  return (
    <div className="dev-performance-scenario dev-page-performance-scenario" data-mf-page-perf-scenario={id}>
      <header className="panel-surface p-3">
        <p className="text-xs font-semibold text-(--text-secondary) uppercase">Page performance scenario</p>
        <h1 className="text-lg font-semibold text-(--text-primary)">{id}</h1>
      </header>
      <main className="dev-page-performance-scenario-main">{children}</main>
    </div>
  )
}

function WorkbenchHomeScenario() {
  return (
    <ScenarioFrame id="workbench-home">
      <StudioDesk
        model={createStudioDeskModel(360)}
        onCreateDraft={noop}
        onImportDraft={asyncNoop}
        onCreatePatch={noop}
        onOpenWorkspace={noop}
        onOpenPatch={noop}
        onOpenDraft={asyncNoop}
        onCopyDraft={asyncNoop}
        onDeleteDraft={asyncNoop}
        onUpdateDraftMetadata={asyncNoop}
        onExportPack={asyncNoop}
        isLoading={false}
        galleryOpen={false}
        onGalleryOpenChange={noop}
      />
    </ScenarioFrame>
  )
}

function EventStageEditorScenario() {
  const [patch, setPatch] = useState<DraftPatch>(() => createEventPatch(96))
  const draft = createCpMakerDraft([patch])

  return (
    <ScenarioFrame id="event-stage-editor">
      <EventPatchEditor
        patch={patch}
        draft={draft}
        onPatchChange={(_, nextPatch) => setPatch((current) => ({ ...current, ...nextPatch }))}
        onAddVirtualAsset={noop}
        locale="en-US"
        theme="dark"
        accentColor={accentColor}
        viewportLabels={editorCopy.viewportLabels}
        selectedEventKey={Object.keys((patch.editorState as { entries?: Record<string, unknown> }).entries ?? {})[0] ?? null}
        gameRootPath={null}
        directoryInfo={null}
      />
    </ScenarioFrame>
  )
}

function ItemWorkspaceScenario() {
  const [items] = useState(() => range(360).map(createItemEntry))
  const itemLookup = new Map(items.map((item) => [item.qualifiedItemId, item]))
  const [activeItemId, setActiveItemId] = useState(items[0]?.key ?? null)
  const [itemFilter, setItemFilter] = useState('')
  const deferredFilter = useDeferredValue(itemFilter)
  const normalizedFilter = deferredFilter.trim().toLowerCase()
  const filteredItems = normalizedFilter ? items.filter((item) => item.searchText.includes(normalizedFilter)) : items
  const item = items.find((entry) => entry.key === activeItemId) ?? items[0] ?? null
  const textureStatesByAssetName: Record<string, ItemTextureAssetState> = {
    'Maps/springobjects': {
      path: 'Content/Maps/springobjects.xnb',
      url: null,
      width: 256,
      height: 1024,
    },
  }

  return (
    <ScenarioFrame id="item-workspace">
      <ItemWorkspace
        item={item}
        items={items}
        filteredItems={filteredItems}
        browserSourceMode="original"
        onBrowserSourceModeChange={noop}
        modItemGroups={[]}
        activeItemModSources={[]}
        activeItemId={activeItemId}
        activeModItemSelectionId={null}
        itemFilter={itemFilter}
        itemLookup={itemLookup}
        textureStatesByAssetName={textureStatesByAssetName}
        ensureTextureAssetStates={noop}
        onItemFilterChange={setItemFilter}
        onSelectItem={setActiveItemId}
        onSelectModItem={noop}
      />
    </ScenarioFrame>
  )
}

function BuildingWorkspaceScenario() {
  const [chain] = useState(() => range(4).map((index) => createBuildingStage(index, 4)))
  const [activeKey, setActiveKey] = useState(chain[0]?.key ?? null)
  const building = chain.find((entry) => entry.key === activeKey) ?? chain[0] ?? null
  const textureState: BuildingTextureAssetState = {
    path: 'Content/Buildings/Barn.xnb',
    url: null,
    width: 256,
    height: 512,
  }
  const chainTextureStates = Object.fromEntries(chain.map((entry) => [entry.textureAssetName ?? entry.key, textureState]))

  return (
    <ScenarioFrame id="building-workspace">
      <BuildingWorkspace
        locale="en-US"
        viewportLabels={editorCopy.viewportLabels}
        theme="dark"
        accentColor={accentColor}
        building={building}
        upgradeChain={chain}
        activeTextureState={textureState}
        chainTextureStates={chainTextureStates}
        activeIndoorMapDocument={null}
        activeIndoorMapPath={null}
        activeIndoorMapMessage="No indoor map loaded for performance scenario."
        activeExteriorMapDocument={null}
        activeExteriorMapPath={null}
        activeExteriorMapMessage="No exterior map loaded for performance scenario."
        activeExteriorFocusPoint={null}
        springObjectsState={{ path: 'Content/Maps/springobjects.xnb', url: null, width: 256, height: 1024 }}
        onSelectBuildingStage={setActiveKey}
      />
    </ScenarioFrame>
  )
}

function MapPatchEditorScenario() {
  const [patch, setPatch] = useState<DraftPatch>(() => ({
    ...createDraftPatch(4, 'map'),
    target: 'Maps/Town',
    action: 'EditMap',
    fromFile: 'assets/maps/PagePerformanceTown.tmx',
    editorState: {
      patchMode: 'ReplaceByLayer',
      properties: {
        Music: 'spring2',
        Outdoors: true,
        Light: '0 0 0',
      },
      warps: range(24).map((index) => ({ fromX: index + 2, fromY: index + 4, toMap: 'Town', toX: 12 + index, toY: 18 })),
      npcWarps: range(18).map((index) => ({ fromX: index + 1, fromY: index + 2, toMap: 'Beach', toX: 8 + index, toY: 12 })),
      mapTiles: range(24).map((index) => ({ layer: 'Back', x: index, y: index % 8, setTilesheet: 'townInterior', setIndex: index + 120 })),
      fromArea: { x: 0, y: 0, width: 12, height: 12 },
      toArea: { x: 4, y: 4, width: 12, height: 12 },
    },
  }))
  const draft = createCpMakerDraft([patch])

  return (
    <ScenarioFrame id="map-patch-editor">
      <MapPatchEditor
        patch={patch}
        draft={draft}
        onPatchChange={(_, nextPatch) => setPatch((current) => ({ ...current, ...nextPatch }))}
        onAddVirtualAsset={noop}
        locale="en-US"
        theme="dark"
        accentColor={accentColor}
        viewportLabels={editorCopy.viewportLabels}
      />
    </ScenarioFrame>
  )
}

function ContentPatcherWorkspaceScenario() {
  const [simulationContext, setSimulationContext] = useState(createSimulationContext)
  const [selectedPatch, setSelectedPatch] = useState<Record<string, unknown> | null>({
    Action: 'EditData',
    Target: 'Data/Locations',
    FromFile: 'assets/locations.json',
    Enabled: true,
    LogName: 'Performance location rewrite',
    When: { Season: 'spring', HasSeenEvent: '900001' },
    Priority: 'Late',
    Update: 'OnLocationChange',
  })
  const projectDetail = createContentPatcherProjectDetail(128)
  const patches = range(128).map((index) => ({
    id: `patch-${index}`,
    action: index % 3 === 0 ? 'EditMap' : index % 3 === 1 ? 'EditImage' : 'EditData',
    target: `Data/PagePerformance/${index}`,
    fromFile: index % 2 === 0 ? `assets/generated/${index}.json` : null,
    logName: `Performance patch ${index}`,
    hasWhen: index % 3 === 0,
    whenKeys: index % 3 === 0 ? ['Season'] : [],
    updateKeys: index % 4 === 0 ? ['OnLocationChange'] : [],
  }))
  const resultAsset = {
    target: { path: 'Data/PagePerformance/0' },
    trace: [],
    result: {
      kind: 'json',
      json: {
        entries: Object.fromEntries(
          range(80).map((index) => [`Entry${index}`, { value: `Generated value ${index}`, enabled: index % 2 === 0 }]),
        ),
      },
    },
    diagnostics: [],
    exportable: true,
  } as unknown as LoadContentPatcherResultAssetResult
  const simulation = {
    plan: { patches: [] },
    targets: range(80).map((index) => ({ path: `Data/PagePerformance/${index}` })),
    patchStatuses: [],
    diagnostics: [],
    dynamicTokens: { PerformanceToken: 'Enabled', Variant: 'festival' },
  } as unknown as ContentPatcherSimulationResult

  return (
    <ScenarioFrame id="content-patcher-workspace">
      <ContentPatcherWorkspace
        pluginDefinition={null}
        projectDetail={projectDetail}
        diagnostics={[]}
        statusMessage="Ready"
        lastSaveResult={null}
        gameRootPath={null}
        manifestEditor={{ text: '{}', value: {}, error: null }}
        contentEditor={{ text: '{}', value: {}, error: null }}
        contentSummary={{
          format: '2.7.0',
          changeCount: patches.length,
          includeCount: 6,
          dynamicTokenCount: 18,
          configKeys: ['Variant', 'HardMode', 'FestivalDay'],
          configEntries: [
            { key: 'Variant', defaultValue: 'festival' },
            { key: 'HardMode', defaultValue: false },
            { key: 'FestivalDay', defaultValue: 12 },
          ],
          patches,
        }}
        selectedPatchId="patch-0"
        selectedPatch={selectedPatch}
        patchWhenError={null}
        hasUnsavedChanges={false}
        canPersist
        contentPatcherSnapshot={null}
        contentPatcherSimulation={simulation}
        contentPatcherResultAsset={resultAsset}
        contentPatcherResultLoading={false}
        contentPatcherResultError={null}
        simulationContext={simulationContext}
        onSimulationContextChange={setSimulationContext}
        onManifestFieldChange={noop}
        onManifestTextChange={noop}
        onContentTextChange={noop}
        onPatchFieldChange={(field, value) => setSelectedPatch((current) => (current ? { ...current, [field]: value } : current))}
        onPatchWhenChange={(value) => setSelectedPatch((current) => (current ? { ...current, When: value } : current))}
        onAddPatch={() =>
          setSelectedPatch((current) =>
            current ? { ...current, LogName: `${typeof current.LogName === 'string' ? current.LogName : ''} + added` } : current,
          )
        }
        onRemoveSelectedPatch={() => setSelectedPatch(null)}
        onSaveProject={noop}
        onExportProject={noop}
      />
    </ScenarioFrame>
  )
}

function LauncherShellScenario() {
  const [page, setPage] = useState<LauncherPageId>('library')

  return (
    <ScenarioFrame id="launcher-shell">
      <LauncherPage
        page={page}
        debugEnabled
        desktopHost
        theme="dark"
        locale="en-US"
        onToggleTheme={noop}
        onAppModeChange={noop}
        onWorkspaceChange={noop}
        onLauncherPageChange={setPage}
        onMinimizeWindow={noop}
        onToggleMaximizeWindow={noop}
        onCloseWindow={noop}
        onOpenSettings={noop}
        onToggleDebugMode={noop}
        onNavigateToDiagnostics={noop}
        onRetryDiagnostics={asyncNoop}
        onLauncherDiagnosticsUpdate={noop}
      />
    </ScenarioFrame>
  )
}

function scenarioFor(id: PageScenarioId) {
  if (id === 'workbench-home') return <WorkbenchHomeScenario />
  if (id === 'event-stage-editor') return <EventStageEditorScenario />
  if (id === 'item-workspace') return <ItemWorkspaceScenario />
  if (id === 'building-workspace') return <BuildingWorkspaceScenario />
  if (id === 'map-patch-editor') return <MapPatchEditorScenario />
  if (id === 'content-patcher-workspace') return <ContentPatcherWorkspaceScenario />
  return <LauncherShellScenario />
}

function resolveScenarioId(): PageScenarioId {
  const requested = new URLSearchParams(window.location.search).get('mfPagePerfScenario')
  return pageScenarioIds.includes(requested as PageScenarioId) ? (requested as PageScenarioId) : 'workbench-home'
}

export function DevPagePerformanceScenario() {
  return (
    <LocaleProvider locale="en-US">
      <CpMakerPortContext.Provider value={performanceCpMakerPort}>
        <LauncherPortContext.Provider value={performanceLauncherPort}>{scenarioFor(resolveScenarioId())}</LauncherPortContext.Provider>
      </CpMakerPortContext.Provider>
    </LocaleProvider>
  )
}
