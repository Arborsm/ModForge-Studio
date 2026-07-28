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

/**
 * In-memory CP Maker draft storage for the browser dev mock.
 *
 * Draft records round-trip unchanged: the mock stores exactly what the frontend
 * sends and hands it back, only stamping the fields the host owns. State lives
 * for the lifetime of the page, so a reload starts from a clean workbench.
 */
export function createCpMakerMockHandler(gameRootPath: string) {
  const drafts = new Map<string, MockDraftRecord>()
  let session: MockSession = { activeDraftKey: null, activeGeneratedDraftKey: null }
  let copyCounter = 0

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

      default:
        return { handled: false }
    }
  }
}
