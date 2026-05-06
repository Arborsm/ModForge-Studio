import { useEffect, useMemo, useState } from 'react'
import { Eye, Map, Calendar, User, Building2, Package } from 'lucide-react'
import type { WorkspaceId } from '@shared/contracts'
import type { GameDirectoryInfo } from '@platform/desktop'
import { scanMaps, scanEvents, scanModProjects, loadMapAsset, loadTextAsset, loadImageDataUrl } from '@platform/desktop'
import type { MapDocument } from '@shared/contracts'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/editor-shell'
import { MapViewport } from '@entities/map'

interface PreviewModeShellProps {
  workspaceMode: WorkspaceId
  gameRootPath: string | null
  directoryInfo: GameDirectoryInfo | null
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
  const [resources, setResources] = useState<ResourceItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedResource, setSelectedResource] = useState<ResourceItem | null>(null)

  // Map preview state
  const [mapDocument, setMapDocument] = useState<MapDocument | null>(null)
  const [mapLoading, setMapLoading] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  // Other workspace preview state
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameRootPath || !directoryInfo) {
      setResources([])
      setSelectedResource(null)
      return
    }

    setLoading(true)
    setSelectedResource(null)

    const scanResources = async () => {
      try {
        const items: ResourceItem[] = []

        switch (workspaceMode) {
          case 'map': {
            if (directoryInfo.mapsPath) {
              const maps = await scanMaps(directoryInfo.mapsPath, locale)
              for (const m of maps) {
                items.push({ id: m.id, name: m.name, type: m.format, path: m.relativePath })
              }
            }
            break
          }
          case 'events': {
            try {
              const events = await scanEvents(gameRootPath)
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
              const mods = await scanModProjects(gameRootPath)
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
              // Fallback placeholder if scan fails
              items.push({ id: 'installed', name: 'Installed Mods', type: 'mod-list', path: 'Mods/' })
            }
            break
          }
        }

        setResources(items)
      } finally {
        setLoading(false)
      }
    }

    void scanResources()
  }, [gameRootPath, directoryInfo, locale, workspaceMode])

  // Load selected resource content
  useEffect(() => {
    if (!selectedResource || !gameRootPath) {
      setMapDocument(null)
      setMapError(null)
      setPreviewContent(null)
      setPreviewImageUrl(null)
      setPreviewError(null)
      return
    }

    setMapLoading(false)
    setPreviewLoading(false)
    setMapError(null)
    setPreviewError(null)

    let cancelled = false

    void (async () => {
      try {
        switch (workspaceMode) {
          case 'map': {
            if (!directoryInfo?.mapsPath) return
            setMapLoading(true)
            const mapPath = `${directoryInfo.mapsPath}\\${selectedResource.name}.xnb`
            const asset = await loadMapAsset(directoryInfo.rootPath, mapPath, locale)
            if (cancelled) return
            if (asset.format === 'xnb') {
              setMapDocument(JSON.parse(asset.content) as MapDocument)
            } else {
              setMapError(`Format ${asset.format} not supported.`)
            }
            setMapLoading(false)
            break
          }
          case 'events': {
            setPreviewLoading(true)
            const eventPath = `${gameRootPath}\\Content\\${selectedResource.path}.xnb`
            const textAsset = await loadTextAsset(gameRootPath, eventPath, locale)
            if (cancelled) return
            setPreviewContent(textAsset.content)
            setPreviewLoading(false)
            break
          }
          case 'characters': {
            setPreviewLoading(true)
            const portraitPath = `${gameRootPath}\\Content\\Portraits\\${selectedResource.name}.xnb`
            const url = await loadImageDataUrl(portraitPath, locale)
            if (cancelled) return
            setPreviewImageUrl(url)
            setPreviewLoading(false)
            break
          }
          case 'buildings': {
            setPreviewLoading(true)
            const buildingPath = `${gameRootPath}\\Content\\Buildings\\${selectedResource.name}.xnb`
            try {
              const url = await loadImageDataUrl(buildingPath, locale)
              if (cancelled) return
              setPreviewImageUrl(url)
            } catch {
              // Some buildings are directories, try alternative paths
              const altPath = `${gameRootPath}\\Content\\Buildings\\${selectedResource.name}_0.xnb`
              try {
                const url = await loadImageDataUrl(altPath, locale)
                if (cancelled) return
                setPreviewImageUrl(url)
              } catch {
                if (!cancelled) setPreviewError('Could not load building texture.')
              }
            }
            setPreviewLoading(false)
            break
          }
          case 'items': {
            setPreviewLoading(true)
            const itemPath = `${gameRootPath}\\Content\\Data\\${selectedResource.name}.xnb`
            const textAsset = await loadTextAsset(gameRootPath, itemPath, locale)
            if (cancelled) return
            setPreviewContent(textAsset.content)
            setPreviewLoading(false)
            break
          }
          case 'mods': {
            // Mod details are already in the resource item; no extra loading needed
            break
          }
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          if (workspaceMode === 'map') setMapError(msg)
          else setPreviewError(msg)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [workspaceMode, selectedResource, gameRootPath, directoryInfo, locale])

  const visibleLayerIds = useMemo(
    () => mapDocument?.layers.map((l) => l.id) ?? [],
    [mapDocument],
  )

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
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          Preview: {WORKSPACE_LABELS[workspaceMode]}
        </span>
        <span className="ml-auto text-[10px] text-[var(--text-secondary)] truncate max-w-[50%]">
          {directoryInfo.rootPath}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: Resource List */}
        <div className="flex w-64 shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-panel)]">
          <div className="border-b border-[var(--border-color)] px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Resources ({resources.length})
            </span>
          </div>

          <div className="flex-1 overflow-auto py-1">
            {loading ? (
              <div className="px-3 py-4 text-center text-xs text-[var(--text-secondary)]">
                Scanning...
              </div>
            ) : resources.length === 0 ? (
              <div className="px-3 py-4 text-center text-[10px] text-[var(--text-secondary)]">
                No resources found.
              </div>
            ) : (
              resources.map((resource) => (
                <button
                  key={resource.id}
                  type="button"
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                    selectedResource?.id === resource.id
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
          {workspaceMode === 'map' && selectedResource ? (
            mapLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
                Loading map...
              </div>
            ) : mapError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
                <Map className="h-8 w-8 opacity-30" />
                <p className="text-sm text-red-400">{mapError}</p>
              </div>
            ) : mapDocument ? (
              <MapViewport
                locale={locale}
                mapDocument={mapDocument}
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
          ) : selectedResource ? (
            previewLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
                Loading...
              </div>
            ) : previewError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
                <Eye className="h-8 w-8 opacity-30" />
                <p className="text-sm text-red-400">{previewError}</p>
              </div>
            ) : (
              <PreviewContent
                workspaceMode={workspaceMode}
                resource={selectedResource}
                content={previewContent}
                imageUrl={previewImageUrl}
                directoryInfo={directoryInfo}
              />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
              <Eye className="h-10 w-10 opacity-30" />
              <p className="text-sm">Select a resource from the left to preview.</p>
              <p className="text-[10px] opacity-70">
                Preview shows original game resources, not draft modifications.
              </p>
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
  directoryInfo: GameDirectoryInfo
}) {
  // Mod detail preview
  if (workspaceMode === 'mods' && resource.type === 'mod') {
    return (
      <div className="h-full overflow-auto p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {WORKSPACE_ICONS[workspaceMode]}
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {resource.name}
            </h2>
            <span className="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
              {resource.type}
            </span>
          </div>

          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
            <div className="space-y-2 text-xs text-[var(--text-secondary)]">
              {resource.version ? (
                <div className="flex gap-2">
                  <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider">Version</span>
                  <span className="text-[var(--text-primary)]">{resource.version}</span>
                </div>
              ) : null}
              {resource.author ? (
                <div className="flex gap-2">
                  <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider">Author</span>
                  <span className="text-[var(--text-primary)]">{resource.author}</span>
                </div>
              ) : null}
              <div className="flex gap-2">
                <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider">Path</span>
                <span className="font-mono text-[var(--text-primary)]">{resource.path}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider">Root</span>
                <span className="font-mono text-[var(--text-primary)]">{directoryInfo.rootPath}</span>
              </div>
            </div>
          </div>

          {resource.description ? (
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Description
              </div>
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
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {resource.name}
          </h2>
          <span className="rounded-full border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
            {resource.type}
          </span>
        </div>

        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
          <div className="space-y-2 text-xs text-[var(--text-secondary)]">
            <div className="flex gap-2">
              <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider">Path</span>
              <span className="font-mono text-[var(--text-primary)]">{resource.path}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider">Type</span>
              <span className="text-[var(--text-primary)]">{resource.type}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider">Root</span>
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
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Content Preview
            </div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-4 text-[var(--text-primary)]">
              {content.slice(0, 10000)}
              {content.length > 10000 && (
                <span className="text-[var(--text-secondary)]">\n\n... ({content.length - 10000} more characters)</span>
              )}
            </pre>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-8">
            <Eye className="h-8 w-8 text-[var(--text-secondary)] opacity-30" />
            <p className="text-xs text-[var(--text-secondary)]">
              No preview available for this resource type.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
