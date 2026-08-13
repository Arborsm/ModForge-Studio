import { readMockSessionState, writeMockSessionState } from './devLauncherMockSessionState'

type MockCommandResult = { handled: true; result: unknown } | { handled: false }

/**
 * Draft payload as the host sees it: opaque JSON apart from the storage key,
 * the two identity fields the draft list renders and the host-owned save and
 * export bookkeeping. Mirrors the Rust side rather than the frontend's draft
 * model, so this mock stays free of feature-layer types.
 */
type MockDraftRecord = {
  draftStorageKey: string
  projectMetadata: { projectName: string; projectUniqueId: string } & Record<string, unknown>
  lastDraftSavedAt: number | null
  lastExportedAt: number | null
  lastExportPath: string | null
  lastExportFingerprint: Record<string, string> | null
} & Record<string, unknown>

type MockSession = { activeDraftKey: string | null; activeGeneratedDraftKey: string | null }

type MockProjectAssetRef = {
  relativePath: string
  mediaType: string
  sizeBytes: number
  sha256: string
  storageKey: string
  sourceType: string
  dependencies: Array<{ relativePath: string; kind: string }>
}

type MockProjectAssetWriteRequest = {
  relativePath: string
  mediaType: string
  bytesBase64: string
  sourceType?: string
}

type MockProjectAssetEntry = { ref: MockProjectAssetRef; bytesBase64: string }

/** sessionStorage snapshot shape; Maps are serialized as entry arrays so JSON can round-trip them. */
type MockCpMakerStateSnapshot = {
  drafts: Array<[string, MockDraftRecord]>
  projectAssets: Array<[string, Array<[string, MockProjectAssetEntry]>]>
  session: MockSession
  copyCounter: number
  assetCounter: number
}

/** Browser-safe deterministic digest: real hosts store a SHA-256, the mock only needs stable uniqueness. */
function mockDigest(input: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** 16x16 solid PNG so mock textures decode for thumbnails and pixel previews. */
const MOCK_TEXTURE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHUlEQVR4nGO45uBAEmIY1TCqAYeGBjU1ktAg1AAAIwEzkBpWLWMAAAAASUVORK5CYII='

/** Builds a minimal valid 16-bit mono WAV (silence) so <audio> previews can decode it. */
function mockWavDataUrl() {
  const sampleRate = 8000
  const samples = 800
  const dataSize = samples * 2
  const bytes = new Uint8Array(44 + dataSize)
  const view = new DataView(bytes.buffer)
  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index)
  }
  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:audio/wav;base64,${btoa(binary)}`
}

function encodeTextBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Fixture vanilla events in the canonical script shape, so hub validation and the import picker behave like the real parser's output. */
function createMockEventScripts() {
  const make = (id: number, actor: string, line: string) => {
    const key = `${910000 + id}/Season spring/Time 900 1400`
    const rawScript = `farmer 12 47 0 ${actor} 12 45 2/skippable/viewport 12 45/speak ${actor} "${line}"/end dialogue`
    return {
      key,
      eventId: `${910000 + id}`,
      preconditions: ['Season spring', 'Time 900 1400'],
      rawScript,
      rawSegments: rawScript.split('/'),
      scene: {
        musicCue: null,
        cameraInstruction: 'viewport 12 45',
        characterInstruction: null,
        actors: [{ id: `${actor}-0`, actorName: actor, tileX: 12, tileY: 45, facingDirection: 2 }],
      },
      commands: [],
    }
  }
  return [
    make(1, 'Abigail', 'The air smells like fresh bread today.'),
    make(2, 'Lewis', 'Welcome to the valley, newcomer!'),
    make(3, 'Sebastian', '...Oh. Didn’t see you there.'),
    make(4, 'Maru', 'I’m tuning my latest invention right now.'),
    make(5, 'Elliott', 'The tide whispers stories to those who listen.'),
  ]
}

/** Minimal TMX map document so the copy-from-game map flow can run in the browser. */
function createMockMapDocument(name: string) {
  const width = 16
  const height = 16
  return {
    name,
    format: 'tmx',
    sourcePath: `Content/Maps/${name}.tmx`,
    relativePath: `Content/Maps/${name}.tmx`,
    width,
    height,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets: [],
    layers: [
      {
        id: 1,
        name: 'Back',
        kind: 'tile',
        width,
        height,
        visible: true,
        opacity: 1,
        offsetX: 0,
        offsetY: 0,
        properties: {},
        gids: Array.from({ length: width * height }, () => 0),
        nonEmptyTiles: 0,
      },
    ],
    objectGroups: [],
  }
}

/**
 * CP Maker draft storage for the browser dev mock.
 *
 * Draft records round-trip unchanged: the mock stores exactly what the frontend
 * sends and hands it back, only stamping the fields the host owns. State is
 * mirrored to sessionStorage on every write so a same-tab reload resumes the
 * workbench where the user left off; a fresh tab starts from a clean mock.
 */
export function createCpMakerMockHandler(gameRootPath: string) {
  const restored = readMockSessionState<MockCpMakerStateSnapshot>('cpMakerState')
  const drafts = new Map<string, MockDraftRecord>(restored?.drafts ?? [])
  // Project asset bytes, keyed by draft then lowercase relative path. Mirrors
  // the host's per-draft asset store so browser-only verification can exercise
  // the asset library (thumbnails, previews) without native dialogs.
  const projectAssets = new Map<string, Map<string, MockProjectAssetEntry>>(
    (restored?.projectAssets ?? []).map(([draftKey, entries]) => [draftKey, new Map(entries)]),
  )
  let session: MockSession = restored?.session ?? { activeDraftKey: null, activeGeneratedDraftKey: null }
  let copyCounter = restored?.copyCounter ?? 0
  let assetCounter = restored?.assetCounter ?? 0

  /** Mirrors the current state to sessionStorage so a same-tab reload resumes it. */
  function persist() {
    writeMockSessionState('cpMakerState', {
      drafts: [...drafts.entries()],
      projectAssets: [...projectAssets.entries()].map(([draftKey, store]) => [draftKey, [...store.entries()]]),
      session,
      copyCounter,
      assetCounter,
    } satisfies MockCpMakerStateSnapshot)
  }

  function toSummary(record: MockDraftRecord) {
    return {
      draftStorageKey: record.draftStorageKey,
      projectName: record.projectMetadata.projectName,
      projectUniqueId: record.projectMetadata.projectUniqueId,
      lastDraftSavedAt: record.lastDraftSavedAt,
      lastExportedAt: record.lastExportedAt,
    }
  }

  function requireDraft(storageKey: string): MockDraftRecord {
    const record = drafts.get(storageKey)
    if (!record) {
      throw new Error(`Dev mock has no CP Maker draft "${storageKey}"`)
    }
    return record
  }

  function readPayload<TValue>(payload: unknown, key: string): TValue | null {
    if (!payload || typeof payload !== 'object' || !(key in payload)) {
      return null
    }
    return (payload as Record<string, TValue>)[key]
  }

  function assetStoreFor(draftStorageKey: string) {
    let store = projectAssets.get(draftStorageKey)
    if (!store) {
      store = new Map()
      projectAssets.set(draftStorageKey, store)
    }
    return store
  }

  function writeMockAsset(draftStorageKey: string, request: MockProjectAssetWriteRequest) {
    assetCounter += 1
    const bytesBase64 = request.bytesBase64 ?? ''
    const ref: MockProjectAssetRef = {
      relativePath: request.relativePath,
      mediaType: request.mediaType,
      sizeBytes: Math.floor((bytesBase64.length * 3) / 4),
      sha256: (mockDigest(bytesBase64) + mockDigest(request.relativePath) + mockDigest(`${assetCounter}`)).padEnd(64, '0'),
      storageKey: `mock-asset-${assetCounter}`,
      sourceType: request.sourceType ?? 'imported',
      dependencies: [],
    }
    assetStoreFor(draftStorageKey).set(request.relativePath.toLowerCase(), { ref, bytesBase64 })
    return ref
  }

  /** Keeps the stored draft's asset refs in sync with the byte store, like the host does transactionally. */
  function syncDraftAssets(draftStorageKey: string) {
    const record = requireDraft(draftStorageKey)
    const store = projectAssets.get(draftStorageKey)
    const assets = store ? [...store.values()].map((entry) => entry.ref) : []
    assets.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    const next: MockDraftRecord = { ...record, projectAssets: assets }
    drafts.set(draftStorageKey, next)
    return next
  }

  return function handleCpMakerMockCommand(command: string, payload: unknown): MockCommandResult {
    switch (command) {
      case 'list_cp_maker_drafts':
        return { handled: true, result: [...drafts.values()].map(toSummary) }

      case 'load_cp_maker_draft': {
        const storageKey = readPayload<string>(payload, 'draftStorageKey') ?? ''
        return { handled: true, result: requireDraft(storageKey) }
      }

      case 'save_cp_maker_draft': {
        const draft = readPayload<MockDraftRecord>(payload, 'draft')
        if (!draft) {
          throw new Error('save_cp_maker_draft called without a draft payload')
        }
        const stored: MockDraftRecord = { ...draft, lastDraftSavedAt: Date.now() }
        drafts.set(stored.draftStorageKey, stored)
        persist()
        return { handled: true, result: stored }
      }

      case 'delete_cp_maker_draft': {
        const storageKey = readPayload<string>(payload, 'draftStorageKey') ?? ''
        drafts.delete(storageKey)
        projectAssets.delete(storageKey)
        if (session.activeDraftKey === storageKey) {
          session = { ...session, activeDraftKey: null }
        }
        persist()
        return { handled: true, result: null }
      }

      case 'copy_cp_maker_draft': {
        const request = readPayload<{ source_draft_storage_key: string }>(payload, 'request')
        const source = requireDraft(request?.source_draft_storage_key ?? '')
        copyCounter += 1
        const copy: MockDraftRecord = {
          ...structuredClone(source),
          draftStorageKey: `${source.draftStorageKey}-copy-${copyCounter}`,
          projectMetadata: {
            ...source.projectMetadata,
            projectName: `${source.projectMetadata.projectName} (${copyCounter})`,
            projectUniqueId: `${source.projectMetadata.projectUniqueId}.copy${copyCounter}`,
          },
          lastDraftSavedAt: Date.now(),
          lastExportedAt: null,
          lastExportPath: null,
          lastExportFingerprint: null,
        }
        drafts.set(copy.draftStorageKey, copy)
        persist()
        return { handled: true, result: copy }
      }

      case 'load_cp_maker_session':
        return { handled: true, result: session }

      case 'save_cp_maker_session': {
        session = readPayload<MockSession>(payload, 'session') ?? session
        persist()
        return { handled: true, result: session }
      }

      case 'export_cp_maker_pack': {
        const request = readPayload<{ output_path?: string; virtual_assets?: Array<{ relativePath: string }> }>(payload, 'request')
        const outputPath = request?.output_path ?? `${gameRootPath}\\Mods\\DevMockExport`
        return {
          handled: true,
          result: {
            output_path: outputPath,
            manifest_path: `${outputPath}\\manifest.json`,
            content_path: `${outputPath}\\content.json`,
            virtual_asset_paths: (request?.virtual_assets ?? []).map((asset) => `${outputPath}\\${asset.relativePath}`),
          },
        }
      }

      case 'read_cp_maker_project_asset': {
        const request = readPayload<{ draftStorageKey: string; relativePath: string }>(payload, 'request')
        const entry = projectAssets.get(request?.draftStorageKey ?? '')?.get((request?.relativePath ?? '').toLowerCase())
        if (!entry) {
          throw new Error(`Dev mock has no project asset "${request?.relativePath ?? ''}"`)
        }
        return { handled: true, result: { asset: entry.ref, bytesBase64: entry.bytesBase64 } }
      }

      case 'load_cp_maker_project_map_asset': {
        // The real host parses TMX/TBin and returns the normalized MapDocument
        // as a JSON string. The mock keeps that contract by convention: seeded
        // map assets store the serialized MapDocument directly as their bytes.
        const request = readPayload<{ draftStorageKey: string; relativePath: string }>(payload, 'request')
        const entry = projectAssets.get(request?.draftStorageKey ?? '')?.get((request?.relativePath ?? '').toLowerCase())
        if (!entry) {
          throw new Error(`Dev mock has no project map asset "${request?.relativePath ?? ''}"`)
        }
        const content = new TextDecoder().decode(Uint8Array.from(atob(entry.bytesBase64), (char) => char.charCodeAt(0)))
        const parsed = JSON.parse(content) as { width?: unknown; layers?: unknown; name?: unknown }
        if (typeof parsed.width !== 'number' || !Array.isArray(parsed.layers)) {
          throw new Error(`Dev mock project map "${request?.relativePath ?? ''}" does not hold a serialized MapDocument`)
        }
        return {
          handled: true,
          result: {
            name: typeof parsed.name === 'string' ? parsed.name : (request?.relativePath ?? 'map').split('/').at(-1),
            format: 'tmx',
            absolutePath: `E:\\ModForge Dev\\Projects\\${request?.relativePath ?? ''}`,
            relativePath: request?.relativePath ?? '',
            content,
          },
        }
      }

      case 'write_cp_maker_project_asset': {
        const request = readPayload<MockProjectAssetWriteRequest & { draftStorageKey: string }>(payload, 'request')
        if (!request) throw new Error('write_cp_maker_project_asset called without a request payload')
        const ref = writeMockAsset(request.draftStorageKey, request)
        syncDraftAssets(request.draftStorageKey)
        persist()
        return { handled: true, result: ref }
      }

      case 'write_cp_maker_project_assets': {
        const request = readPayload<{ draftStorageKey: string; assets: MockProjectAssetWriteRequest[] }>(payload, 'request')
        if (!request) throw new Error('write_cp_maker_project_assets called without a request payload')
        const refs = request.assets.map((asset) => writeMockAsset(request.draftStorageKey, asset))
        syncDraftAssets(request.draftStorageKey)
        persist()
        return { handled: true, result: refs }
      }

      case 'rename_cp_maker_project_asset': {
        const request = readPayload<{ draftStorageKey: string; relativePath: string; newRelativePath: string }>(payload, 'request')
        if (!request) throw new Error('rename_cp_maker_project_asset called without a request payload')
        const store = assetStoreFor(request.draftStorageKey)
        const entry = store.get(request.relativePath.toLowerCase())
        if (!entry) {
          throw new Error(`Dev mock has no project asset "${request.relativePath}"`)
        }
        store.delete(request.relativePath.toLowerCase())
        entry.ref = { ...entry.ref, relativePath: request.newRelativePath }
        store.set(request.newRelativePath.toLowerCase(), entry)
        const renamed = syncDraftAssets(request.draftStorageKey)
        persist()
        return { handled: true, result: renamed }
      }

      case 'delete_cp_maker_project_asset': {
        const request = readPayload<{ draftStorageKey: string; relativePath: string }>(payload, 'request')
        if (!request) throw new Error('delete_cp_maker_project_asset called without a request payload')
        assetStoreFor(request.draftStorageKey).delete(request.relativePath.toLowerCase())
        const deleted = syncDraftAssets(request.draftStorageKey)
        persist()
        return { handled: true, result: deleted }
      }

      case 'scan_maps':
        // Two vanilla maps are enough for browser verification to exercise the
        // catalog's create-on-click EditMap flow through the real UI path.
        return {
          handled: true,
          result: [
            {
              id: 'mock-map-town',
              name: 'Town',
              fileName: 'Town.tmx',
              format: 'tmx',
              absolutePath: `${gameRootPath}\\Content\\Maps\\Town.tmx`,
              relativePath: 'Maps/Town.tmx',
              sizeBytes: 128_000,
            },
            {
              id: 'mock-map-farm',
              name: 'Farm',
              fileName: 'Farm.tmx',
              format: 'tmx',
              absolutePath: `${gameRootPath}\\Content\\Maps\\Farm.tmx`,
              relativePath: 'Maps/Farm.tmx',
              sizeBytes: 96_000,
            },
          ],
        }

      case 'load_map_asset': {
        const request = readPayload<{ mapPath?: string }>(payload, 'mapPath')
        const mapPath = request?.mapPath ?? `${gameRootPath}\\Content\\Maps\\Town.xnb`
        const name = (mapPath.split(/[\\/]/).at(-1) ?? 'Town').replace(/\.(?:xnb|tmx|tbin)$/iu, '')
        return {
          handled: true,
          result: {
            name,
            format: 'tmx',
            absolutePath: mapPath,
            relativePath: `Content/Maps/${name}.tmx`,
            content: JSON.stringify(createMockMapDocument(name)),
          },
        }
      }

      case 'build_cp_maker_map_asset': {
        const request = readPayload<{ relativePath?: string; mapDocument?: unknown }>(payload, 'request')
        const relativePath = request?.relativePath ?? 'assets/maps/map.tmx'
        return {
          handled: true,
          result: {
            asset: {
              relativePath,
              mediaType: 'application/octet-stream',
              bytesBase64: encodeTextBase64(request?.mapDocument != null ? JSON.stringify(request.mapDocument) : '{}'),
            },
            companionAssets: [],
          },
        }
      }

      case 'scan_audio_assets':
        return {
          handled: true,
          result: [
            {
              cue: 'cowboy_kidnapping',
              kind: 'music',
              absolutePath: `${gameRootPath}\\Content\\Music\\cowboy_kidnapping.wav`,
              relativePath: 'Content/Music/cowboy_kidnapping.wav',
            },
            {
              cue: 'achievement',
              kind: 'sound',
              absolutePath: `${gameRootPath}\\Content\\Audio\\achievement.wav`,
              relativePath: 'Content/Audio/achievement.wav',
            },
          ],
        }

      case 'scan_image_assets':
        return {
          handled: true,
          result: [
            {
              name: 'Characters/Abigail',
              relativePath: 'Content/Characters/Abigail.xnb',
              absolutePath: `${gameRootPath}\\Content\\Characters\\Abigail.xnb`,
              sizeBytes: 128_000,
            },
            {
              name: 'Portraits/Abigail',
              relativePath: 'Content/Portraits/Abigail.xnb',
              absolutePath: `${gameRootPath}\\Content\\Portraits\\Abigail.xnb`,
              sizeBytes: 96_000,
            },
          ],
        }

      case 'scan_data_assets':
        return {
          handled: true,
          result: [
            {
              name: 'Data/ObjectInformation',
              relativePath: 'Content/Data/ObjectInformation.xnb',
              absolutePath: `${gameRootPath}\\Content\\Data\\ObjectInformation.xnb`,
              sizeBytes: 256_000,
            },
            {
              name: 'Data/NPCGiftTastes',
              relativePath: 'Content/Data/NPCGiftTastes.xnb',
              absolutePath: `${gameRootPath}\\Content\\Data\\NPCGiftTastes.xnb`,
              sizeBytes: 48_000,
            },
          ],
        }

      case 'load_image_data_url':
        return { handled: true, result: `data:image/png;base64,${MOCK_TEXTURE_PNG_BASE64}` }

      case 'load_audio_data_url':
        return { handled: true, result: mockWavDataUrl() }

      case 'load_text_asset': {
        const request = readPayload<{ assetPath?: string }>(payload, 'assetPath')
        const assetPath = request?.assetPath ?? 'Content/Data/ObjectInformation.xnb'
        const name = (assetPath.split(/[\\/]/).at(-1) ?? 'Asset').replace(/\.(?:xnb|json)$/iu, '')
        return {
          handled: true,
          result: {
            absolutePath: `${gameRootPath}\\${assetPath}`,
            relativePath: assetPath,
            content: JSON.stringify({ asset: name, mock: true }, null, 2),
          },
        }
      }

      case 'scan_events':
        // Two vanilla event files so the create dialog can list locations and
        // prefill a draft from parsed "game" events through the real UI path.
        return {
          handled: true,
          result: ['Town', 'Beach'].map((name) => ({
            id: `Content/Data/Events/${name}.xnb`,
            name,
            fileName: `${name}.xnb`,
            absolutePath: `${gameRootPath}\\Content\\Data\\Events\\${name}.xnb`,
            relativePath: `Content/Data/Events/${name}.xnb`,
            sizeBytes: 64_000,
          })),
        }

      case 'load_event_asset': {
        const request = readPayload<{ assetPath?: string }>(payload, 'assetPath')
        const assetPath = request?.assetPath ?? 'Content/Data/Events/Town.xnb'
        return {
          handled: true,
          result: {
            absolutePath: `${gameRootPath}\\${assetPath.replaceAll('/', '\\')}`,
            relativePath: assetPath,
            events: createMockEventScripts(),
          },
        }
      }

      default:
        return { handled: false }
    }
  }
}
