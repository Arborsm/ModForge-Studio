import { useDeferredValue, useState, type ReactNode } from 'react'
import { localeBundles } from '@locales'
import { LocaleProvider } from '@locales/provider'
import { LauncherPortContext } from '@features/launcher/model/launcherPortContext'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
import type { LauncherDiscoverDetail, LauncherLibraryItem } from '@features/launcher/model/types'
import { LauncherModDetailPanel } from '@features/launcher/ui/cards/LauncherModDetailPanel'
import { PatchQuickMenu } from '@features/cp-maker/ui/PatchQuickMenu'
import { StudioDeskProjectGallery } from '@features/cp-maker/ui/StudioDeskProjectGallery'
import { StudioDeskStoryboard } from '@features/cp-maker/ui/StudioDeskStoryboard'
import { StudioDeskWorldBible } from '@features/cp-maker/ui/StudioDeskWorldBible'
import { ModI18nWorkspace } from '@pages/workbench/workspaces/mod-i18n'
import { EventConditionBuilderModal } from '@entities/event/ui/EventConditionBuilderModal'
import { EventGameStateQueryBuilderModal } from '@entities/event/ui/EventGameStateQueryBuilderModal'
import type { ContentPatcherI18nFile, ModProjectDetail } from '@entities/mod/api'
import type { EventPatchHubEvent } from '@entities/event'
import type { DraftPatch, WorkspaceId } from '@features/cp-maker'
import type { StudioDeskGalleryProject, StudioDeskInspiration, StudioDeskModel, StudioDeskWorldBibleModel } from '@features/cp-maker'

const copy = localeBundles['en-US']
const editorCopy = copy.editor
const hubCopy = editorCopy.studioDesk.eventPatchHub
const noop = () => {}
const asyncNoop = async () => {}

const launcherPort = {
  isRemoteModIdInvalid: () => false,
  markRemoteModIdInvalid: noop,
  loadRemoteModDetail: async () => createRemoteDetail(48),
  openUrl: asyncNoop,
  openPath: asyncNoop,
  toDesktopAssetUrl: (path: string) => path,
  resolveImage: async () => ({ sourceUrl: '', localPath: '', mimeType: '' }),
  subscribeUpdates: () => noop,
  listenToUpdateProgress: async () => noop,
  listenToDownloadProgress: async () => noop,
} as unknown as LauncherPort

type ScenarioId =
  | 'cp-maker-patch-menu'
  | 'cp-maker-world-bible'
  | 'cp-maker-storyboard'
  | 'cp-maker-project-gallery'
  | 'mod-i18n'
  | 'event-condition-builder'
  | 'event-game-state-query-builder'
  | 'launcher-mod-detail'

const scenarioIds: ScenarioId[] = [
  'cp-maker-patch-menu',
  'cp-maker-world-bible',
  'cp-maker-storyboard',
  'cp-maker-project-gallery',
  'mod-i18n',
  'event-condition-builder',
  'event-game-state-query-builder',
  'launcher-mod-detail',
]

function range(count: number) {
  return Array.from({ length: count }, (_, index) => index)
}

function workspaceFor(index: number): WorkspaceId {
  return ['events', 'map', 'characters', 'buildings', 'items', 'mods'][index % 6] as WorkspaceId
}

function createPatch(index: number): DraftPatch {
  const actions: DraftPatch['action'][] = ['EditData', 'EditImage', 'EditMap', 'Load', 'Include']
  return {
    id: `patch-${index}`,
    workspace: workspaceFor(index),
    target: `Data/Locations/PerformanceTarget${index % 80}`,
    action: actions[index % actions.length],
    logName: `Festival expansion patch ${index}`,
    enabled: index % 9 !== 0,
    updatedAt: Date.now() - index * 60_000,
    fromFile: index % 4 === 0 ? `assets/generated/${index}.json` : undefined,
    when: index % 3 === 0 ? { Season: 'spring', HasSeenEvent: `${700000 + index}` } : undefined,
    editorState: {
      entries: {
        [`perf.event.${index}`]: `Abigail ${index} ${index % 80} 2 farmer 10 10 2/speak "Performance event ${index}"/end`,
      },
    },
  }
}

function createWorldBible(count: number): StudioDeskWorldBibleModel {
  const makeEntries = (prefix: string) =>
    range(count).map((index) => ({
      key: `${prefix}.${index}`,
      value: `Generated ${prefix} value with a long searchable description ${index}`,
    }))

  return {
    configSchema: makeEntries('config'),
    tokens: makeEntries('token'),
    customLocations: makeEntries('location'),
    actors: makeEntries('actor'),
    story: makeEntries('story'),
    items: makeEntries('item'),
    scenes: makeEntries('scene'),
    conflictCount: Math.floor(count / 12),
  }
}

function createInspirations(count: number): StudioDeskInspiration[] {
  return range(count).map((index) => ({
    patchId: `patch-${index}`,
    kind: index % 4 === 0 ? 'event' : index % 4 === 1 ? 'map' : index % 4 === 2 ? 'asset' : 'project',
    title: `Storyboard beat ${index}`,
    target: `Maps/Festival${index % 50}`,
    action: index % 2 === 0 ? 'EditData' : 'EditMap',
    updatedAt: Date.now() - index * 120_000,
    status: index % 5 === 0 ? 'modified' : 'synced',
    workspaceId: workspaceFor(index),
  }))
}

function createGalleryProjects(count: number): StudioDeskGalleryProject[] {
  const tones: StudioDeskGalleryProject['coverTone'][] = ['festival', 'harbor', 'market', 'forest', 'greenhouse', 'archive']
  return range(count).map((index) => ({
    draftStorageKey: `draft-${index}`,
    title: `Performance content pack ${index}`,
    uniqueId: `ModForge.Performance.${index}`,
    lastEditedAt: Date.now() - index * 90_000,
    lastExportedAt: index % 6 === 0 ? null : Date.now() - index * 180_000,
    isCurrent: index === 2,
    statuses: index % 7 === 0 ? ['conflict'] : ['export'],
    searchText: `performance content pack ${index} ModForge.Performance.${index}`,
    coverTone: tones[index % tones.length],
    conflictCount: index % 7 === 0 ? 2 : 0,
    needsMetadata: index % 11 === 0,
  }))
}

function createStudioDeskModel(count: number): StudioDeskModel {
  const galleryProjects = createGalleryProjects(count)
  return {
    projectName: 'Performance Scenario',
    projectDescription: 'Dev-only render stress scenario',
    projectAuthor: 'ModForge',
    projectVersion: '1.0.0',
    projectUniqueId: 'ModForge.Performance',
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
    worldBible: createWorldBible(Math.max(32, Math.floor(count / 3))),
    exportSummary: {
      lastExportedAt: Date.now() - 240_000,
      fileList: range(40).map((index) => `content/perf-${index}.json`),
    },
  }
}

function createI18nFiles(count: number): ContentPatcherI18nFile[] {
  const sourceEntries = Object.fromEntries(
    range(count).map((index) => [`perf.key.${index}`, `Source string with {{token${index % 9}}} ${index}`]),
  )
  const targetEntries = Object.fromEntries(
    range(count).map((index) => [`perf.key.${index}`, index % 5 === 0 ? '' : `Translated string with {{token${index % 9}}} ${index}`]),
  )

  return [
    {
      locale: 'default',
      path: 'i18n/default.json',
      relativePath: 'i18n/default.json',
      rawJson: JSON.stringify(sourceEntries),
      entryCount: count,
    },
    {
      locale: 'zh-CN',
      path: 'i18n/zh-CN.json',
      relativePath: 'i18n/zh-CN.json',
      rawJson: JSON.stringify(targetEntries),
      entryCount: count,
    },
  ]
}

function createProjectDetail(count: number): ModProjectDetail {
  return {
    pluginKind: 'content-patcher',
    capabilities: ['i18n'],
    summary: {
      id: 'perf-project',
      name: 'Performance i18n pack',
      author: 'ModForge',
      version: '1.0.0',
      description: 'Large translation fixture',
      uniqueId: 'ModForge.PerformanceI18n',
      contentPackFor: 'Pathoschild.ContentPatcher',
      folderName: 'PerformanceI18n',
      absolutePath: 'E:/Perf/PerformanceI18n',
      manifestPath: 'E:/Perf/PerformanceI18n/manifest.json',
      contentPath: 'E:/Perf/PerformanceI18n/content.json',
      pluginKind: 'content-patcher',
      status: 'ready',
      missingRequiredDependencies: [],
    },
    diagnostics: [],
    contentPatcher: {
      manifestPath: 'E:/Perf/PerformanceI18n/manifest.json',
      contentPath: 'E:/Perf/PerformanceI18n/content.json',
      manifestJson: '{}',
      contentJson: '{}',
      format: '2.7.0',
      changeCount: count,
      includeCount: 0,
      dynamicTokenCount: 12,
      configKeys: [],
      hasI18n: true,
      i18nFiles: createI18nFiles(count),
      patches: [],
    },
  }
}

function createEvent(index: number): EventPatchHubEvent {
  return {
    key: `event-${index}`,
    eventId: `${700000 + index}`,
    title: `Performance event ${index}`,
    status: index % 6 === 0 ? 'draft' : 'done',
    severity: index % 13 === 0 ? 'warn' : 'ok',
    triggers: ['spring', 'sunny', `seen-${index}`],
    location: `Town${index % 12}`,
    actors: range(8).map((actorIndex) => ({ name: `NPC${actorIndex}`, tileX: actorIndex + 4, tileY: actorIndex + 10 })),
    commandCount: 48,
    dialogueCount: 12,
    issueCount: index % 13 === 0 ? 1 : 0,
    scriptSteps: range(18).map((step) => ({ index: step, title: `Step ${step}`, detail: `Command detail ${step}` })),
    preconditionGroups: {
      environment: [],
      player: [],
      progress: [],
    },
  }
}

function createLocalMod(): LauncherLibraryItem {
  return {
    id: 'local-perf-mod',
    labelKey: 'local-perf-mod',
    name: 'Performance Expansion',
    author: 'ModForge',
    version: '1.0.0',
    description: 'Local description '.repeat(80),
    uniqueId: 'ModForge.PerformanceExpansion',
    folderName: 'PerformanceExpansion',
    absolutePath: 'E:/Stardew/Mods/PerformanceExpansion',
    enabled: true,
    nexusModId: 900001,
    updateKeys: ['Nexus:900001'],
    modUrl: 'https://example.invalid/mods/performance',
    imageUrl: null,
    requiredDependencies: range(20).map((index) => `Required dependency ${index}`),
    missingRequiredDependencies: range(4).map((index) => `Missing dependency ${index}`),
  }
}

function createRemoteDetail(fileCount: number): LauncherDiscoverDetail {
  return {
    modId: 900001,
    title: 'Performance Expansion',
    summary: 'Remote summary '.repeat(40),
    description: '[h2]Large description[/h2]\n'.repeat(80),
    author: 'ModForge',
    version: '2.0.0',
    modUrl: 'https://example.invalid/mods/performance',
    imageUrl: null,
    galleryImages: [],
    updatedAt: new Date().toISOString(),
    fileSize: 24_000_000,
    category: 'Gameplay',
    downloads: 120_000,
    endorsements: 30_000,
    directDownloadEnabled: true,
    supportsVortex: true,
    primaryFileId: 100,
    primaryFileName: 'Performance Expansion.zip',
    primaryFileVersion: '2.0.0',
    primaryFileSize: 24_000_000,
    primaryFileSizeBytes: 24_000_000,
    primaryFileChangelog: range(24).map((index) => `Changelog entry ${index}`),
    requiredLoader: 'SMAPI',
    gameVersion: '1.6',
    archiveType: 'zip',
    updateRisk: 'low',
    requirements: range(24).map((index) => ({
      name: `Remote requirement ${index}`,
      notes: `Requirement note ${index}`,
      url: 'https://example.invalid/requirement',
      external: index % 5 === 0,
    })),
    files: range(fileCount).map((index) => ({
      fileId: 10_000 + index,
      name: `Performance file ${index}.zip`,
      version: `2.${index}.0`,
      category: index % 5 === 0 ? 'optional' : 'main',
      uploadedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
      description: `File description ${index}`,
      uniqueDownloads: 1_000 + index,
      totalDownloads: 4_000 + index,
      managerDownloadEnabled: true,
      size: 12_000_000 + index,
      sizeBytes: 12_000_000 + index,
      primary: index === 0,
      archiveType: 'zip',
      changelog: [`File changelog ${index}`],
    })),
  }
}

function ScenarioFrame({ id, children }: { id: ScenarioId; children: ReactNode }) {
  return (
    <div className="dev-performance-scenario" data-mf-perf-scenario={id}>
      <header className="panel-surface p-3">
        <p className="text-xs font-semibold text-(--text-secondary) uppercase">Compiler cleanup performance scenario</p>
        <h1 className="text-lg font-semibold text-(--text-primary)">{id}</h1>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  )
}

function PatchMenuScenario() {
  const [activePatchId, setActivePatchId] = useState<string | null>('patch-4')
  return (
    <ScenarioFrame id="cp-maker-patch-menu">
      <div className="p-8">
        <PatchQuickMenu patches={range(360).map(createPatch)} activePatchId={activePatchId} onSelectPatch={setActivePatchId} />
      </div>
    </ScenarioFrame>
  )
}

function WorldBibleScenario() {
  return (
    <ScenarioFrame id="cp-maker-world-bible">
      <StudioDeskWorldBible
        id="perf-world-bible"
        bible={createWorldBible(260)}
        exportSummary={{ lastExportedAt: Date.now() - 60_000, fileList: range(72).map((index) => `file-${index}.json`) }}
        isLoading={false}
        onCloseDrawer={noop}
        onExportPack={noop}
      />
    </ScenarioFrame>
  )
}

function StoryboardScenario() {
  return (
    <ScenarioFrame id="cp-maker-storyboard">
      <StudioDeskStoryboard
        inspirations={createInspirations(520)}
        hasActiveDraft
        onCreateDraft={noop}
        onCreatePatch={noop}
        onOpenPatch={noop}
        onPreviewFocusChange={noop}
      />
    </ScenarioFrame>
  )
}

function ProjectGalleryScenario() {
  return (
    <ScenarioFrame id="cp-maker-project-gallery">
      <StudioDeskProjectGallery
        model={createStudioDeskModel(420)}
        onCreateDraftRequest={noop}
        onImportDraftRequest={asyncNoop}
        onOpenDraft={asyncNoop}
        onCopyDraft={asyncNoop}
        onDeleteDraft={asyncNoop}
        onEditCurrentDraftProperties={noop}
      />
    </ScenarioFrame>
  )
}

function ModI18nScenario() {
  const [files, setFiles] = useState(() => createI18nFiles(420))
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [statusFilter, setStatusFilter] = useState<'all' | 'translated' | 'missing' | 'empty' | 'error'>('all')
  return (
    <ScenarioFrame id="mod-i18n">
      <ModI18nWorkspace
        copy={copy.modI18n}
        projectDetail={createProjectDetail(420)}
        i18nFiles={files}
        sourceLocale="default"
        targetLocale="zh-CN"
        query={deferredQuery}
        statusFilter={statusFilter}
        canPersist
        onSourceLocaleChange={noop}
        onTargetLocaleChange={noop}
        onQueryChange={setQuery}
        onStatusFilterChange={setStatusFilter}
        onI18nFilesChange={setFiles}
        onSave={noop}
      />
    </ScenarioFrame>
  )
}

function EventConditionScenario() {
  const event = createEvent(1)
  return (
    <ScenarioFrame id="event-condition-builder">
      <EventConditionBuilderModal
        event={event}
        allEvents={range(240).map(createEvent)}
        alias="performance-alias"
        hubCopy={hubCopy}
        copy={hubCopy.conditionBuilder}
        onApply={noop}
        onCancel={noop}
      />
    </ScenarioFrame>
  )
}

function EventGameStateScenario() {
  return (
    <ScenarioFrame id="event-game-state-query-builder">
      <EventGameStateQueryBuilderModal
        copy={hubCopy.conditionBuilder.gameStateQueryBuilder}
        hubCopy={hubCopy}
        initialQuery="TIME 1900 2300, PLAYER_HAS_ITEM (O)74 12"
        onApply={noop}
        onCancel={noop}
      />
    </ScenarioFrame>
  )
}

function LauncherDetailScenario() {
  return (
    <ScenarioFrame id="launcher-mod-detail">
      <LauncherModDetailPanel
        open
        onClose={noop}
        mod={createLocalMod()}
        remoteDetail={createRemoteDetail(72)}
        onToggleEnabled={noop}
        onOpenFolder={noop}
        onSetCover={noop}
        onClearCover={noop}
        onQueueDownload={noop}
      />
    </ScenarioFrame>
  )
}

function scenarioFor(id: ScenarioId) {
  if (id === 'cp-maker-patch-menu') return <PatchMenuScenario />
  if (id === 'cp-maker-world-bible') return <WorldBibleScenario />
  if (id === 'cp-maker-storyboard') return <StoryboardScenario />
  if (id === 'cp-maker-project-gallery') return <ProjectGalleryScenario />
  if (id === 'mod-i18n') return <ModI18nScenario />
  if (id === 'event-condition-builder') return <EventConditionScenario />
  if (id === 'event-game-state-query-builder') return <EventGameStateScenario />
  return <LauncherDetailScenario />
}

function resolveScenarioId(): ScenarioId {
  const requested = new URLSearchParams(window.location.search).get('mfPerfScenario')
  return scenarioIds.includes(requested as ScenarioId) ? (requested as ScenarioId) : 'cp-maker-patch-menu'
}

export function DevPerformanceScenario() {
  return (
    <LocaleProvider locale="en-US">
      <LauncherPortContext.Provider value={launcherPort}>{scenarioFor(resolveScenarioId())}</LauncherPortContext.Provider>
    </LocaleProvider>
  )
}
