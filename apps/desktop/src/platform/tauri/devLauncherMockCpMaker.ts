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

/** Browser-safe deterministic digest: real hosts store a SHA-256, the mock only needs stable uniqueness. */
function mockDigest(input: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * In-memory CP Maker draft storage for the browser dev mock.
 *
 * Draft records round-trip unchanged: the mock stores exactly what the frontend
 * sends and hands it back, only stamping the fields the host owns. State lives
 * for the lifetime of the page, so a reload starts from a clean workbench.
 */
export function createCpMakerMockHandler(gameRootPath: string) {
  const drafts = new Map<string, MockDraftRecord>()
  // In-memory project asset bytes, keyed by draft then lowercase relative path.
  // Mirrors the host's per-draft asset store so browser-only verification can
  // exercise the asset library (thumbnails, previews) without native dialogs.
  const projectAssets = new Map<string, Map<string, { ref: MockProjectAssetRef; bytesBase64: string }>>()
  let session: MockSession = { activeDraftKey: null, activeGeneratedDraftKey: null }
  let copyCounter = 0
  let assetCounter = 0

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
        return { handled: true, result: stored }
      }

      case 'delete_cp_maker_draft': {
        const storageKey = readPayload<string>(payload, 'draftStorageKey') ?? ''
        drafts.delete(storageKey)
        projectAssets.delete(storageKey)
        if (session.activeDraftKey === storageKey) {
          session = { ...session, activeDraftKey: null }
        }
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
        return { handled: true, result: copy }
      }

      case 'load_cp_maker_session':
        return { handled: true, result: session }

      case 'save_cp_maker_session': {
        session = readPayload<MockSession>(payload, 'session') ?? session
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
        return { handled: true, result: ref }
      }

      case 'write_cp_maker_project_assets': {
        const request = readPayload<{ draftStorageKey: string; assets: MockProjectAssetWriteRequest[] }>(payload, 'request')
        if (!request) throw new Error('write_cp_maker_project_assets called without a request payload')
        const refs = request.assets.map((asset) => writeMockAsset(request.draftStorageKey, asset))
        syncDraftAssets(request.draftStorageKey)
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
        return { handled: true, result: syncDraftAssets(request.draftStorageKey) }
      }

      case 'delete_cp_maker_project_asset': {
        const request = readPayload<{ draftStorageKey: string; relativePath: string }>(payload, 'request')
        if (!request) throw new Error('delete_cp_maker_project_asset called without a request payload')
        assetStoreFor(request.draftStorageKey).delete(request.relativePath.toLowerCase())
        return { handled: true, result: syncDraftAssets(request.draftStorageKey) }
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

      default:
        return { handled: false }
    }
  }
}
