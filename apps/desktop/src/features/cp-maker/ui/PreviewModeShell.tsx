import { useEffect, useMemo, useState } from 'react'
import { Eye, Map, Calendar, User, Building2, Package } from 'lucide-react'
import { useCpMakerPort } from '@features/cp-maker/provider'
import type { WorkspaceId } from '@shared/contracts'
import type { MapDocument } from '@shared/contracts'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/editor-shell'
import { MapViewport } from '@entities/map'

interface PreviewModeShellProps {
  workspaceMode: WorkspaceId
  gameRootPath: string | null
  directoryInfo: { rootPath: string; executablePath: string; mapsPath: string | null; mapCount: number } | null
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  viewportLabels: ViewportLabels
}

type ResourceItem = {
  id: string
  name: string
  type: string
  path: string
  author?: string
  version?: string
  description?: string
}

type ResourceListState = {
  key: string
  status: 'idle' | 'loading' | 'ready'
  items: ResourceItem[]
}

type ResourcePreviewState = {
  key: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  mapDocument: MapDocument | null
  content: string | null
  imageUrl: string | null
  error: string | null
}

const WORKSPACE_ICONS: Record<WorkspaceId, React.ReactNode> = {
  mods: <Package className="h-5 w-5" />,
  map: <Map className="h-5 w-5" />,
  events: <Calendar className="h-5 w-5" />,
  characters: <User className="h-5 w-5" />,
  buildings: <Building2 className="h-5 w-5" />,
  items: <Package className="h-5 w-5" />,
}

const WORKSPACE_LABELS: Record<WorkspaceId, string> = {
  mods: 'Mods',
  map: 'Maps',
  events: 'Events',
  characters: 'Characters',
  buildings: 'Buildings',
  items: 'Items',
}

export function PreviewModeShell({
  workspaceMode,
  gameRootPath,
  directoryInfo,
  locale,
  theme,
  accentColor,
  viewportLabels,
}: PreviewModeShellProps) {
  const port = useCpMakerPort()
  const resourceListKey = `${workspaceMode}:${gameRootPath ?? ''}:${directoryInfo?.rootPath ?? ''}:${locale}`
  const [resourceListState, setResourceListState] = useState<ResourceListState>({
    key: resourceListKey,
    status: gameRootPath && directoryInfo ? 'loading' : 'idle',
    items: [],
  })
  const [selectedResource, setSelectedResource] = useState<ResourceItem | null>(null)
  const selectedResourceKey = selectedResource
    ? `${workspaceMode}:${gameRootPath ?? ''}:${locale}:${selectedResource.id}:${selectedResource.path}`
    : ''
  const [previewState, setPreviewState] = useState<ResourcePreviewState>({
    key: selectedResourceKey,
    status: selectedResource && gameRootPath ? 'loading' : 'idle',
    mapDocument: null,
    content: null,
    imageUrl: null,
    error: null,
  })

  useEffect(() => {
    if (!gameRootPath || !directoryInfo) {
      return
    }

    const scanResources = async () => {
      const items: ResourceItem[] = []

      switch (workspaceMode) {
        case 'map': {
          if (directoryInfo.mapsPath) {
            const maps = await port.scanMaps(directoryInfo.mapsPath, locale)
            for (const m of maps) {
              items.push({ id: m.id, name: m.name, type: m.format, path: m.relativePath })
            }
          }
          break
        }
        case 'events': {
          try {
            const events = await port.scanEvents(gameRootPath)
            for (const e of events) {
              items.push({ id: e.id, name: e.name, type: 'events', path: e.relativePath })
            }
          } catch {
            items.push(
              { id: 'town', name: 'Town Events', type: 'events', path: 'Data/Events/Town' },
              { id: 'beach', name: 'Beach Events', type: 'events', path: 'Data/Events/Beach' },
              { id: 'mountain', name: 'Mountain Events', type: 'events', path: 'Data/Events/Mountain' },
            )
          }
          break
        }
        case 'characters': {
          const chars = ['Abigail', 'Alex', 'Elliott', 'Emily', 'Haley', 'Harvey', 'Leah', 'Maru', 'Penny', 'Sam', 'Sebastian', 'Shane']
          for (const name of chars) {
            items.push({ id: name.toLowerCase(), name, type: 'portrait', path: `Portraits/${name}` })
          }
          break
        }
        case 'buildings': {
          const buildings = ['houses', 'barn', 'coop', 'silo', 'well', 'stable', 'slimehutch', 'shed', 'junimohut', 'mill']
          for (const name of buildings) {
            items.push({ id: name, name: name.charAt(0).toUpperCase() + name.slice(1), type: 'building', path: `Buildings/${name}` })
          }
          break
        }
        case 'items': {
          const itemFiles = ['Objects', 'Crops', 'CraftingRecipes', 'Furniture', 'BigCraftables', 'Boots', 'Hats', 'Weapons']
          for (const name of itemFiles) {
            items.push({ id: name.toLowerCase(), name, type: 'item-data', path: `Data/${name}` })
          }
          break
        }
        case 'mods': {
          try {
            const mods = await port.scanModProjects(gameRootPath)
            for (const m of mods) {
              items.push({
                id: m.id,
                name: m.name,
                type: 'mod',
                path: `Mods/${m.id}/`,
                author: m.author ?? undefined,
                version: m.version ?? undefined,
                description: m.description ?? undefined,
              })
            }
          } catch {
            items.push({ id: 'installed', name: 'Installed Mods', type: 'mod-list', path: 'Mods/' })
          }
          break
        }
      }

      setResourceListState({
        key: resourceListKey,
        status: 'ready',
        items,
      })
    }

    void scanResources()
  }, [gameRootPath, directoryInfo, locale, workspaceMode, port, resourceListKey])

  const resources = resourceListState.key === resourceListKey ? resourceListState.items : []
  const loading =
    Boolean(gameRootPath && directoryInfo) && (resourceListState.key !== resourceListKey || resourceListState.status === 'loading')
  const currentSelectedResource =
    selectedResource && resources.some((resource) => resource.id === selectedResource.id) ? selectedResource : null

  // Load selected resource content
  useEffect(() => {
    if (!currentSelectedResource || !gameRootPath) {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        switch (workspaceMode) {
          case 'map': {
            if (!directoryInfo?.mapsPath) return
            const mapPath = `${directoryInfo.mapsPath}\\${currentSelectedResource.name}.xnb`
            const asset = await port.loadMapAsset(directoryInfo.rootPath, mapPath, locale)
            if (cancelled) return
            if (asset.format === 'xnb') {
              setPreviewState({
                key: selectedResourceKey,
                status: 'ready',
                mapDocument: JSON.parse(asset.content) as MapDocument,
                content: null,
                imageUrl: null,
                error: null,
              })
            } else {
              setPreviewState({
                key: selectedResourceKey,
                status: 'error',
                mapDocument: null,
                content: null,
                imageUrl: null,
                error: `Format ${asset.format} not supported.`,
              })
            }
            break
          }
          case 'events': {
            const eventPath = `${gameRootPath}\\Content\\${currentSelectedResource.path}.xnb`
            const textAsset = await port.loadTextAsset(gameRootPath, eventPath, locale)
            if (cancelled) return
            setPreviewState({
              key: selectedResourceKey,
              status: 'ready',
              mapDocument: null,
              content: textAsset.content,
              imageUrl: null,
              error: null,
            })
            break
          }
          case 'characters': {
            const portraitPath = `${gameRootPath}\\Content\\Portraits\\${currentSelectedResource.name}.xnb`
            const url = await port.loadImageDataUrl(portraitPath, locale)
            if (cancelled) return
            setPreviewState({
              key: selectedResourceKey,
              status: 'ready',
              mapDocument: null,
              content: null,
              imageUrl: url,
              error: null,
            })
            break
          }
          case 'buildings': {
            const buildingPath = `${gameRootPath}\\Content\\Buildings\\${currentSelectedResource.name}.xnb`
            try {
              const url = await port.loadImageDataUrl(buildingPath, locale)
              if (cancelled) return
              setPreviewState({
                key: selectedResourceKey,
                status: 'ready',
                mapDocument: null,
                content: null,
                imageUrl: url,
                error: null,
              })
            } catch {
              // Some buildings are directories, try alternative paths
              const altPath = `${gameRootPath}\\Content\\Buildings\\${currentSelectedResource.name}_0.xnb`
              try {
                const url = await port.loadImageDataUrl(altPath, locale)
                if (cancelled) return
                setPreviewState({
                  key: selectedResourceKey,
                  status: 'ready',
                  mapDocument: null,
                  content: null,
                  imageUrl: url,
                  error: null,
                })
              } catch {
                if (!cancelled) {
                  setPreviewState({
                    key: selectedResourceKey,
                    status: 'error',
                    mapDocument: null,
                    content: null,
                    imageUrl: null,
                    error: 'Could not load building texture.',
                  })
                }
              }
            }
            break
          }
          case 'items': {
            const itemPath = `${gameRootPath}\\Content\\Data\\${currentSelectedResource.name}.xnb`
            const textAsset = await port.loadTextAsset(gameRootPath, itemPath, locale)
            if (cancelled) return
            setPreviewState({
              key: selectedResourceKey,
              status: 'ready',
              mapDocument: null,
              content: textAsset.content,
              imageUrl: null,
              error: null,
            })
            break
          }
          case 'mods': {
            // Mod details are already in the resource item; no extra loading needed
            setPreviewState({
              key: selectedResourceKey,
              status: 'ready',
              mapDocument: null,
              content: null,
              imageUrl: null,
              error: null,
            })
            break
          }
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          setPreviewState({
            key: selectedResourceKey,
            status: 'error',
            mapDocument: null,
            content: null,
            imageUrl: null,
            error: msg,
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [workspaceMode, currentSelectedResource, selectedResourceKey, gameRootPath, directoryInfo, locale, port])

  const currentPreviewState =
    previewState.key === selectedResourceKey
      ? previewState
      : {
          key: selectedResourceKey,
          status: currentSelectedResource && gameRootPath ? ('loading' as const) : ('idle' as const),
          mapDocument: null,
          content: null,
          imageUrl: null,
          error: null,
        }

  const visibleLayerIds = useMemo(() => currentPreviewState.mapDocument?.layers.map((l) => l.id) ?? [], [currentPreviewState.mapDocument])

  if (!gameRootPath || !directoryInfo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
        <Eye className="h-10 w-10 opacity-30" />
        <p className="text-sm">No game directory selected.</p>
        <p className="text-xs">Select a game directory to preview resources.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg-app)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-4 py-2.5">
        <Eye className="h-4 w-4 text-[var(--accent)]" />
        <span className="text-xs font-semibold text-[var(--text-primary)]">Preview: {WORKSPACE_LABELS[workspaceMode]}</span>
        <span className="ml-auto max-w-[50%] truncate text-[10px] text-[var(--text-secondary)]">{directoryInfo.rootPath}</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: Resource List */}
        <div className="flex w-64 shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-panel)]">
          <div className="border-b border-[var(--border-color)] px-3 py-2">
            <span className="text-[10px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
              Resources ({resources.length})
            </span>
          </div>

          <div className="flex-1 overflow-auto py-1">
            {loading ? (
              <div className="px-3 py-4 text-center text-xs text-[var(--text-secondary)]">Scanning...</div>
            ) : resources.length === 0 ? (
              <div className="px-3 py-4 text-center text-[10px] text-[var(--text-secondary)]">No resources found.</div>
            ) : (
              resources.map((resource) => (
                <button
                  key={resource.id}
                  type="button"
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                    currentSelectedResource?.id === resource.id
                      ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]'
                  }`}
                  onClick={() => setSelectedResource(resource)}
                >
                  {WORKSPACE_ICONS[workspaceMode]}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{resource.name}</div>
                    <div className="truncate text-[10px] opacity-70">{resource.path}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Center: Preview Area */}
        <div className="min-w-0 flex-1 overflow-hidden">
          {workspaceMode === 'map' && currentSelectedResource ? (
            currentPreviewState.status === 'loading' ? (
              <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">Loading map...</div>
            ) : currentPreviewState.error ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
                <Map className="h-8 w-8 opacity-30" />
                <p className="text-sm text-red-400">{currentPreviewState.error}</p>
              </div>
            ) : currentPreviewState.mapDocument ? (
              <MapViewport
                locale={locale}
                mapDocument={currentPreviewState.mapDocument}
                visibleLayerIds={visibleLayerIds}
                visibleObjectGroupIds={[]}
                labels={viewportLabels}
                theme={theme}
                accentColor={accentColor}
                showGrid={false}
                showStatsChips={false}
                contextMenuEnabled={false}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
                <Map className="h-8 w-8 opacity-30" />
                <p className="text-sm">Select a map to preview.</p>
              </div>
            )
          ) : currentSelectedResource ? (
            currentPreviewState.status === 'loading' ? (
              <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">Loading...</div>
            ) : currentPreviewState.error ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
                <Eye className="h-8 w-8 opacity-30" />
                <p className="text-sm text-red-400">{currentPreviewState.error}</p>
              </div>
            ) : (
              <PreviewContent
                workspaceMode={workspaceMode}
                resource={currentSelectedResource}
                content={currentPreviewState.content}
                imageUrl={currentPreviewState.imageUrl}
                directoryInfo={directoryInfo}
              />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
              <Eye className="h-10 w-10 opacity-30" />
              <p className="text-sm">Select a resource from the left to preview.</p>
              <p className="text-[10px] opacity-70">Preview shows original game resources, not draft modifications.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PreviewContent({
  workspaceMode,
  resource,
  content,
  imageUrl,
  directoryInfo,
}: {
  workspaceMode: WorkspaceId
  resource: ResourceItem
  content: string | null
  imageUrl: string | null
  directoryInfo: { rootPath: string; executablePath: string; mapsPath: string | null; mapCount: number }
}) {
  // Mod detail preview
  if (workspaceMode === 'mods' && resource.type === 'mod') {
    return (
      <div className="h-full overflow-auto p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {WORKSPACE_ICONS[workspaceMode]}
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{resource.name}</h2>
            <span className="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
              {resource.type}
            </span>
          </div>

          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
            <div className="space-y-2 text-xs text-[var(--text-secondary)]">
              {resource.version ? (
                <div className="flex gap-2">
                  <span className="w-20 shrink-0 text-[10px] tracking-wider uppercase">Version</span>
                  <span className="text-[var(--text-primary)]">{resource.version}</span>
                </div>
              ) : null}
              {resource.author ? (
                <div className="flex gap-2">
                  <span className="w-20 shrink-0 text-[10px] tracking-wider uppercase">Author</span>
                  <span className="text-[var(--text-primary)]">{resource.author}</span>
                </div>
              ) : null}
              <div className="flex gap-2">
                <span className="w-20 shrink-0 text-[10px] tracking-wider uppercase">Path</span>
                <span className="font-mono text-[var(--text-primary)]">{resource.path}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-20 shrink-0 text-[10px] tracking-wider uppercase">Root</span>
                <span className="font-mono text-[var(--text-primary)]">{directoryInfo.rootPath}</span>
              </div>
            </div>
          </div>

          {resource.description ? (
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
              <div className="mb-2 text-[10px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">Description</div>
              <p className="text-xs leading-5 text-[var(--text-primary)]">{resource.description}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-8">
              <Eye className="h-8 w-8 text-[var(--text-secondary)] opacity-30" />
              <p className="text-xs text-[var(--text-secondary)]">No description available.</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {WORKSPACE_ICONS[workspaceMode]}
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{resource.name}</h2>
          <span className="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
            {resource.type}
          </span>
        </div>

        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
          <div className="space-y-2 text-xs text-[var(--text-secondary)]">
            <div className="flex gap-2">
              <span className="w-16 shrink-0 text-[10px] tracking-wider uppercase">Path</span>
              <span className="font-mono text-[var(--text-primary)]">{resource.path}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-16 shrink-0 text-[10px] tracking-wider uppercase">Type</span>
              <span className="text-[var(--text-primary)]">{resource.type}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-16 shrink-0 text-[10px] tracking-wider uppercase">Root</span>
              <span className="font-mono text-[var(--text-primary)]">{directoryInfo.rootPath}</span>
            </div>
          </div>
        </div>

        {/* Content Preview */}
        {imageUrl ? (
          <div className="flex items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-4">
            <img
              src={imageUrl}
              alt={resource.name}
              className="max-h-[60vh] max-w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        ) : content ? (
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
            <div className="mb-2 text-[10px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">Content Preview</div>
            <pre className="max-h-[60vh] overflow-auto font-mono text-[10px] leading-4 break-all whitespace-pre-wrap text-[var(--text-primary)]">
              {content.slice(0, 10000)}
              {content.length > 10000 && (
                <span className="text-[var(--text-secondary)]">\n\n... ({content.length - 10000} more characters)</span>
              )}
            </pre>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-8">
            <Eye className="h-8 w-8 text-[var(--text-secondary)] opacity-30" />
            <p className="text-xs text-[var(--text-secondary)]">No preview available for this resource type.</p>
          </div>
        )}
      </div>
    </div>
  )
}
