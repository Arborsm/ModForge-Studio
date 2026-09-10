/** @file In-memory editor session state of the map workspace; survives module switches. */

import { create } from 'zustand'
import type { MapDocument } from '@entities/map'

/** Tile-edit session bound to one patch card. */
export type MapTilesSession = {
  patchId: string
  cardId: string
  target: string
}

/** Open "edit this project map asset" session. The document reloads per mount. */
export type MapAssetSession = {
  relativePath: string
  document: MapDocument | null
  loadError: string | null
}

/** Live tile-session with its own target document load state. */
export type MapTilesSessionState = {
  session: MapTilesSession
  document: MapDocument | null
  loadError: string | null
}

type MapEditorSessionState = {
  mapAsset: MapAssetSession | null
  mapTiles: MapTilesSessionState | null
  openMapAsset: (relativePath: string) => void
  settleMapAssetDocument: (document: MapDocument) => void
  settleMapAssetLoadError: (message: string) => void
  retryMapAsset: () => void
  closeMapAsset: () => void
  openMapTiles: (session: MapTilesSession) => void
  settleMapTilesDocument: (document: MapDocument) => void
  settleMapTilesLoadError: (message: string) => void
  retryMapTiles: () => void
  closeMapTiles: () => void
}

/**
 * Session-level state for the map workspace editors (asset editor and patch
 * tile sessions). AuthoringRuntime unmounts on module switches, so keeping
 * sessions here lets the workbench return to the editor that was open instead
 * of dropping the user back on the module landing. This store is transient:
 * restart restore for the asset session persists only the relative path via
 * app UI state, and the document reloads.
 */
export const useMapEditorSessionStore = create<MapEditorSessionState>((set) => ({
  mapAsset: null,
  mapTiles: null,
  openMapAsset: (relativePath) =>
    set((state) => ({
      // Reopening the same asset keeps its loaded document/error state.
      mapAsset: state.mapAsset?.relativePath === relativePath ? state.mapAsset : { relativePath, document: null, loadError: null },
    })),
  settleMapAssetDocument: (document) =>
    set((state) => (state.mapAsset ? { mapAsset: { ...state.mapAsset, document, loadError: null } } : state)),
  settleMapAssetLoadError: (loadError) => set((state) => (state.mapAsset ? { mapAsset: { ...state.mapAsset, loadError } } : state)),
  retryMapAsset: () => set((state) => (state.mapAsset ? { mapAsset: { ...state.mapAsset, loadError: null } } : state)),
  closeMapAsset: () => set({ mapAsset: null }),
  openMapTiles: (session) =>
    set((state) => ({
      mapTiles:
        state.mapTiles && state.mapTiles.session.patchId === session.patchId && state.mapTiles.session.cardId === session.cardId
          ? state.mapTiles
          : { session, document: null, loadError: null },
    })),
  settleMapTilesDocument: (document) =>
    set((state) => (state.mapTiles ? { mapTiles: { ...state.mapTiles, document, loadError: null } } : state)),
  settleMapTilesLoadError: (loadError) => set((state) => (state.mapTiles ? { mapTiles: { ...state.mapTiles, loadError } } : state)),
  retryMapTiles: () => set((state) => (state.mapTiles ? { mapTiles: { ...state.mapTiles, loadError: null } } : state)),
  closeMapTiles: () => set({ mapTiles: null }),
}))
