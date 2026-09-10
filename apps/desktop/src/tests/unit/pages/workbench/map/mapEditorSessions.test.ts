import { beforeEach, describe, expect, it } from 'vite-plus/test'

import type { MapDocument } from '@entities/map'
import { useMapEditorSessionStore } from '@pages/workbench/workspaces/map/model/mapEditorSessions'

const document = { version: '1.4' } as unknown as MapDocument

/** Resets the module-scoped session store between tests. */
function resetStore() {
  useMapEditorSessionStore.setState({ mapAsset: null, mapTiles: null })
}

describe('mapEditorSessions store', () => {
  beforeEach(resetStore)

  it('opens an asset session with an empty document slot and settles the loaded document', () => {
    useMapEditorSessionStore.getState().openMapAsset('assets/maps/A.tmx')
    expect(useMapEditorSessionStore.getState().mapAsset).toEqual({
      relativePath: 'assets/maps/A.tmx',
      document: null,
      loadError: null,
    })

    useMapEditorSessionStore.getState().settleMapAssetDocument(document)
    expect(useMapEditorSessionStore.getState().mapAsset?.document).toBe(document)
    expect(useMapEditorSessionStore.getState().mapAsset?.loadError).toBeNull()
  })

  it('reopening the same asset keeps its settled document; switching assets resets the slot', () => {
    useMapEditorSessionStore.getState().openMapAsset('assets/maps/A.tmx')
    useMapEditorSessionStore.getState().settleMapAssetDocument(document)

    useMapEditorSessionStore.getState().openMapAsset('assets/maps/A.tmx')
    expect(useMapEditorSessionStore.getState().mapAsset?.document).toBe(document)

    useMapEditorSessionStore.getState().openMapAsset('assets/maps/B.tmx')
    expect(useMapEditorSessionStore.getState().mapAsset).toEqual({
      relativePath: 'assets/maps/B.tmx',
      document: null,
      loadError: null,
    })
  })

  it('records load failures and retry clears them for another load attempt', () => {
    useMapEditorSessionStore.getState().openMapAsset('assets/maps/A.tmx')
    useMapEditorSessionStore.getState().settleMapAssetLoadError('asset missing')

    const failed = useMapEditorSessionStore.getState().mapAsset
    expect(failed?.loadError).toBe('asset missing')
    expect(failed?.document).toBeNull()

    useMapEditorSessionStore.getState().retryMapAsset()
    expect(useMapEditorSessionStore.getState().mapAsset?.loadError).toBeNull()
  })

  it('closing the asset session clears it entirely', () => {
    useMapEditorSessionStore.getState().openMapAsset('assets/maps/A.tmx')
    useMapEditorSessionStore.getState().settleMapAssetDocument(document)
    useMapEditorSessionStore.getState().closeMapAsset()
    expect(useMapEditorSessionStore.getState().mapAsset).toBeNull()
  })

  it('tile sessions keep state for the same patch card and reset when the card changes', () => {
    const session = { patchId: 'p1', cardId: 'c1', target: 'Maps/Town' }
    useMapEditorSessionStore.getState().openMapTiles(session)
    useMapEditorSessionStore.getState().settleMapTilesDocument(document)
    expect(useMapEditorSessionStore.getState().mapTiles).toEqual({ session, document, loadError: null })

    useMapEditorSessionStore.getState().openMapTiles({ ...session })
    expect(useMapEditorSessionStore.getState().mapTiles?.document).toBe(document)

    useMapEditorSessionStore.getState().openMapTiles({ ...session, cardId: 'c2' })
    expect(useMapEditorSessionStore.getState().mapTiles).toEqual({ session: { ...session, cardId: 'c2' }, document: null, loadError: null })
  })

  it('tile session retry clears only the error', () => {
    useMapEditorSessionStore.getState().openMapTiles({ patchId: 'p1', cardId: 'c1', target: 'Maps/Town' })
    useMapEditorSessionStore.getState().settleMapTilesLoadError('map failed')
    expect(useMapEditorSessionStore.getState().mapTiles?.loadError).toBe('map failed')

    useMapEditorSessionStore.getState().retryMapTiles()
    expect(useMapEditorSessionStore.getState().mapTiles?.loadError).toBeNull()
    expect(useMapEditorSessionStore.getState().mapTiles?.document).toBeNull()
  })

  it('settle actions are no-ops without an open session', () => {
    useMapEditorSessionStore.getState().settleMapAssetDocument(document)
    useMapEditorSessionStore.getState().settleMapAssetLoadError('x')
    useMapEditorSessionStore.getState().retryMapAsset()
    useMapEditorSessionStore.getState().settleMapTilesDocument(document)
    useMapEditorSessionStore.getState().settleMapTilesLoadError('x')
    useMapEditorSessionStore.getState().retryMapTiles()
    expect(useMapEditorSessionStore.getState().mapAsset).toBeNull()
    expect(useMapEditorSessionStore.getState().mapTiles).toBeNull()
  })
})
