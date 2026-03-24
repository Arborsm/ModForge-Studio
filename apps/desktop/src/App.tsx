import { useEffect, useState } from 'react'
import './App.css'
import { MapViewport, type TileHoverInfo } from './components/MapViewport'
import {
  canUseDesktopHost,
  chooseGameDirectory,
  detectDefaultGameDirectory,
  loadMapAsset,
  scanMaps,
  validateGameDirectory,
  type GameDirectoryInfo,
  type MapAssetSummary,
} from './lib/desktop'
import { parseTmxMap } from './lib/maps/tmx'
import type { MapDocument } from './lib/maps/types'

const knownGamePath = 'E:\\SteamLibrary\\steamapps\\common\\Stardew Valley'

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function App() {
  const [gameDirectory, setGameDirectory] = useState(knownGamePath)
  const [directoryInfo, setDirectoryInfo] = useState<GameDirectoryInfo | null>(null)
  const [maps, setMaps] = useState<MapAssetSummary[]>([])
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const [mapDocument, setMapDocument] = useState<MapDocument | null>(null)
  const [visibleLayerIds, setVisibleLayerIds] = useState<number[]>([])
  const [hoverInfo, setHoverInfo] = useState<TileHoverInfo | null>(null)
  const [status, setStatus] = useState('Waiting for a game directory')
  const [error, setError] = useState<string | null>(null)
  const [mapLoadError, setMapLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mapBusy, setMapBusy] = useState(false)

  const desktopHostReady = canUseDesktopHost()

  useEffect(() => {
    if (!desktopHostReady) {
      setStatus('Run this screen inside Tauri to access your local Stardew Valley folder.')
      return
    }

    void (async () => {
      setBusy(true)
      setError(null)
      setStatus('Detecting a default Stardew Valley installation...')

      try {
        const detectedPath = await detectDefaultGameDirectory()
        const nextPath = detectedPath ?? knownGamePath
        setGameDirectory(nextPath)
        const info = await validateGameDirectory(nextPath)
        const mapResults = await scanMaps(nextPath)
        setDirectoryInfo(info)
        setMaps(mapResults)
        setStatus(`Loaded ${mapResults.length} ${info.preferredFormat.toUpperCase()} map assets`)
      } catch (bootstrapError) {
        setError(bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError))
        setStatus('Automatic detection failed. Choose the folder manually.')
      } finally {
        setBusy(false)
      }
    })()
  }, [desktopHostReady])

  async function handleValidate(path = gameDirectory) {
    if (!path.trim()) {
      setError('Enter a Stardew Valley game folder before validating.')
      return
    }

    setBusy(true)
    setError(null)
    setStatus('Validating game directory...')

    try {
      const info = await validateGameDirectory(path)
      setDirectoryInfo(info)
      setStatus(`Validated ${info.rootPath}`)
    } catch (validationError) {
      setDirectoryInfo(null)
      setMaps([])
      setSelectedMapId(null)
      setMapDocument(null)
      setVisibleLayerIds([])
      setHoverInfo(null)
      setError(validationError instanceof Error ? validationError.message : String(validationError))
      setStatus('Directory validation failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleScan(path = gameDirectory) {
    if (!path.trim()) {
      setError('Enter a Stardew Valley game folder before scanning.')
      return
    }

    setBusy(true)
    setError(null)
    setMapLoadError(null)
    setStatus('Validating and scanning map assets...')

    try {
      const info = await validateGameDirectory(path)
      const mapResults = await scanMaps(path)
      setDirectoryInfo(info)
      setMaps(mapResults)
      setSelectedMapId(null)
      setMapDocument(null)
      setVisibleLayerIds([])
      setHoverInfo(null)
      setStatus(`Loaded ${mapResults.length} ${info.preferredFormat.toUpperCase()} map assets`)
    } catch (scanError) {
      setDirectoryInfo(null)
      setMaps([])
      setSelectedMapId(null)
      setMapDocument(null)
      setVisibleLayerIds([])
      setHoverInfo(null)
      setError(scanError instanceof Error ? scanError.message : String(scanError))
      setStatus('Map scan failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleChooseDirectory() {
    try {
      const selectedPath = await chooseGameDirectory()
      if (!selectedPath) {
        return
      }

      setGameDirectory(selectedPath)
      await handleValidate(selectedPath)
    } catch (dialogError) {
      setError(dialogError instanceof Error ? dialogError.message : String(dialogError))
      setStatus('Directory selection failed.')
    }
  }

  async function handleLoadMap(map: MapAssetSummary) {
    if (!directoryInfo) {
      setMapLoadError('Validate a game directory before loading a map.')
      return
    }

    setSelectedMapId(map.id)
    setMapBusy(true)
    setMapLoadError(null)

    try {
      const loadedMap = await loadMapAsset(directoryInfo.rootPath, map.absolutePath)
      if (loadedMap.format !== 'tmx') {
        throw new Error('Only TMX maps are supported for MapDocument loading right now.')
      }

      const document = parseTmxMap(loadedMap.absolutePath, loadedMap.relativePath, loadedMap.content)
      setMapDocument(document)
      setVisibleLayerIds(document.layers.filter((layer) => layer.visible).map((layer) => layer.id))
      setHoverInfo(null)
    } catch (loadError) {
      setMapDocument(null)
      setVisibleLayerIds([])
      setHoverInfo(null)
      setMapLoadError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setMapBusy(false)
    }
  }

  function toggleLayer(layerId: number) {
    setVisibleLayerIds((current) =>
      current.includes(layerId)
        ? current.filter((id) => id !== layerId)
        : [...current, layerId],
    )
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">ModForge Studio</p>
        <h1>MapDocument loading now drives a first-pass tile viewport.</h1>
        <p className="lede">
          The desktop shell can now choose a game folder, scan the available maps, load a selected
          TMX file into the editor&apos;s internal data model, and render its visible tile layers.
        </p>
      </section>

      <section className="workspace-grid">
        <article className="panel panel-emphasis">
          <span className="label">Game Source</span>
          <h2>Stardew Valley directory</h2>
          <p className="panel-copy">
            For the current machine the known path is `E:\SteamLibrary\steamapps\common\Stardew Valley`.
          </p>

          <label className="field">
            <span>Game directory</span>
            <input
              value={gameDirectory}
              onChange={(event) => setGameDirectory(event.target.value)}
              placeholder="Select the Stardew Valley install folder"
            />
          </label>

          <div className="actions">
            <button type="button" onClick={handleChooseDirectory} disabled={busy || !desktopHostReady}>
              Choose folder
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setGameDirectory(knownGamePath)
                void handleValidate(knownGamePath)
              }}
              disabled={busy}
            >
              Use known path
            </button>
            <button type="button" className="secondary" onClick={() => void handleValidate()} disabled={busy}>
              Validate
            </button>
            <button type="button" onClick={() => void handleScan()} disabled={busy}>
              Scan maps
            </button>
          </div>

          <p className="status">{busy ? 'Working...' : status}</p>
          {error ? <p className="error">{error}</p> : null}
        </article>

        <article className="panel">
          <span className="label">Validation</span>
          <h2>Directory summary</h2>
          {directoryInfo ? (
            <dl className="details">
              <div>
                <dt>Preferred source</dt>
                <dd>{directoryInfo.preferredFormat.toUpperCase()}</dd>
              </div>
              <div>
                <dt>Executable</dt>
                <dd>{directoryInfo.executablePath}</dd>
              </div>
              <div>
                <dt>Preferred maps path</dt>
                <dd>{directoryInfo.preferredMapsPath ?? 'Unavailable'}</dd>
              </div>
              <div>
                <dt>Unpacked maps</dt>
                <dd>{directoryInfo.hasUnpackedMaps ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>XNB maps</dt>
                <dd>{directoryInfo.hasXnbMaps ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>Map count</dt>
                <dd>{directoryInfo.mapCount}</dd>
              </div>
            </dl>
          ) : (
            <p className="placeholder">Validate a directory to inspect its layout.</p>
          )}
        </article>

        <article className="panel">
          <span className="label">MapDocument</span>
          <h2>Selected map summary</h2>
          {mapDocument ? (
            <dl className="details">
              <div>
                <dt>Name</dt>
                <dd>{mapDocument.name}</dd>
              </div>
              <div>
                <dt>Dimensions</dt>
                <dd>
                  {mapDocument.width} x {mapDocument.height} tiles
                </dd>
              </div>
              <div>
                <dt>Tile size</dt>
                <dd>
                  {mapDocument.tileWidth} x {mapDocument.tileHeight} px
                </dd>
              </div>
              <div>
                <dt>Layers</dt>
                <dd>{mapDocument.layers.length}</dd>
              </div>
              <div>
                <dt>Object groups</dt>
                <dd>{mapDocument.objectGroups.length}</dd>
              </div>
              <div>
                <dt>Tilesets</dt>
                <dd>{mapDocument.tilesets.length}</dd>
              </div>
            </dl>
          ) : (
            <p className="placeholder">Pick a scanned TMX map to build the first internal MapDocument.</p>
          )}
          {mapLoadError ? <p className="error">{mapLoadError}</p> : null}
          {mapBusy ? <p className="status">Loading selected map...</p> : null}
        </article>
      </section>

      <section className="map-workspace">
        <section className="panel maps-panel">
          <div className="maps-header">
            <div>
              <span className="label">Maps</span>
              <h2>Scanned map assets</h2>
            </div>
            <p>{maps.length ? `${maps.length} files ready for TMX parsing` : 'No maps loaded yet.'}</p>
          </div>

          {maps.length ? (
            <div className="map-list">
              {maps.map((map) => (
                <button
                  type="button"
                  className={`map-card ${selectedMapId === map.id ? 'map-card-selected' : ''}`}
                  key={map.id}
                  onClick={() => void handleLoadMap(map)}
                  disabled={mapBusy}
                >
                  <div className="map-card-heading">
                    <strong>{map.name}</strong>
                    <span>{map.format.toUpperCase()}</span>
                  </div>
                  <p>{map.relativePath}</p>
                  <footer>
                    <span>{map.fileName}</span>
                    <span>{formatBytes(map.sizeBytes)}</span>
                  </footer>
                </button>
              ))}
            </div>
          ) : (
            <p className="placeholder">
              After scanning, this panel will show the maps discovered in the selected game folder.
            </p>
          )}
        </section>

        <section className="panel document-panel">
          <div className="maps-header">
            <div>
              <span className="label">Document</span>
              <h2>MapDocument internals</h2>
            </div>
            <p>{mapDocument ? mapDocument.relativePath : 'No map loaded yet.'}</p>
          </div>

          {mapDocument ? (
            <div className="document-sections">
              <section className="document-section">
                <h3>Viewport</h3>
                <MapViewport
                  key={mapDocument.sourcePath}
                  mapDocument={mapDocument}
                  visibleLayerIds={visibleLayerIds}
                  onHoverChange={setHoverInfo}
                />
              </section>

              <section className="document-section">
                <h3>Map properties</h3>
                {Object.keys(mapDocument.properties).length ? (
                  <dl className="details compact-details">
                    {Object.entries(mapDocument.properties).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="placeholder">This map has no root-level custom properties.</p>
                )}
              </section>

              <section className="document-section">
                <h3>Tilesets</h3>
                <div className="document-list">
                  {mapDocument.tilesets.map((tileset) => (
                    <article className="document-card" key={`${tileset.firstGid}-${tileset.name}`}>
                      <strong>{tileset.name}</strong>
                      <p>firstgid {tileset.firstGid}</p>
                      <p>
                        {tileset.tileCount} tiles at {tileset.tileWidth} x {tileset.tileHeight}
                      </p>
                      <p>{tileset.imageSource ?? 'No image source'}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="document-section">
                <h3>Tile layers</h3>
                <div className="layer-controls">
                  {mapDocument.layers.map((layer) => (
                    <label key={layer.id} className="layer-toggle">
                      <input
                        type="checkbox"
                        checked={visibleLayerIds.includes(layer.id)}
                        onChange={() => toggleLayer(layer.id)}
                      />
                      <span>{layer.name}</span>
                    </label>
                  ))}
                </div>
                <div className="document-list">
                  {mapDocument.layers.map((layer) => (
                    <article className="document-card" key={`${layer.id}-${layer.name}`}>
                      <strong>{layer.name}</strong>
                      <p>
                        {layer.width} x {layer.height}
                      </p>
                      <p>{layer.nonEmptyTiles} non-empty tiles</p>
                      <p>{layer.visible ? 'Visible' : 'Hidden'}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="document-section">
                <h3>Object groups</h3>
                {mapDocument.objectGroups.length ? (
                  <div className="document-list">
                    {mapDocument.objectGroups.map((group) => (
                      <article className="document-card" key={`${group.id}-${group.name}`}>
                        <strong>{group.name}</strong>
                        <p>{group.objects.length} objects</p>
                        <p>{group.visible ? 'Visible' : 'Hidden'}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="placeholder">This map has no object groups.</p>
                )}
              </section>

              <section className="document-section">
                <h3>Hovered tile</h3>
                {hoverInfo ? (
                  <dl className="details compact-details">
                    <div>
                      <dt>Tile</dt>
                      <dd>
                        {hoverInfo.tileX}, {hoverInfo.tileY}
                      </dd>
                    </div>
                    <div>
                      <dt>Pixel</dt>
                      <dd>
                        {hoverInfo.pixelX}, {hoverInfo.pixelY}
                      </dd>
                    </div>
                    <div>
                      <dt>Layer</dt>
                      <dd>{hoverInfo.layerName ?? 'Empty across visible layers'}</dd>
                    </div>
                    <div>
                      <dt>GID</dt>
                      <dd>{hoverInfo.gid ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Tileset</dt>
                      <dd>{hoverInfo.tilesetName ?? 'None'}</dd>
                    </div>
                    <div>
                      <dt>Tile ID</dt>
                      <dd>{hoverInfo.tileId ?? 'None'}</dd>
                    </div>
                    <div>
                      <dt>Tile properties</dt>
                      <dd>
                        {hoverInfo.tileProperties && Object.keys(hoverInfo.tileProperties).length
                          ? Object.entries(hoverInfo.tileProperties)
                              .map(([key, value]) => `${key}=${String(value)}`)
                              .join(', ')
                          : 'None'}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="placeholder">Move the cursor over the viewport to inspect a tile.</p>
                )}
              </section>
            </div>
          ) : (
            <p className="placeholder">
              Load a TMX map from the left to inspect the parsed MapDocument structure.
            </p>
          )}
        </section>
      </section>
    </main>
  )
}

export default App
