/**
 * @file AI platform Provider: adapts host AI commands into an AiPort and injects it into the entity-layer AiProvider.
 */
import { useMemo, type ReactNode } from 'react'
import { AiProvider } from '@entities/ai'
import type { AiPort } from '@shared/contracts'
import {
  cancelAiJob,
  clearAiTranslationCache,
  fetchAiModelsDevCatalog,
  getAiTranslationCacheStats,
  listAiModels,
  listenToAiProgress,
  listenToAiStream,
  loadAiSettings,
  readAiTranslationCache,
  saveAiSettings,
  exportAiProfiles,
  previewAiProfilesImport,
  applyAiProfilesImport,
  testAiProfile,
  translateAiBatch,
  writeAiTranslationCache,
} from '@platform/host'

function createAiPort(): AiPort {
  return {
    loadSettings: loadAiSettings,
    saveSettings: saveAiSettings,
    exportProfiles: exportAiProfiles,
    previewProfilesImport: previewAiProfilesImport,
    applyProfilesImport: applyAiProfilesImport,
    listModels: listAiModels,
    fetchModelsDevCatalog: fetchAiModelsDevCatalog,
    testProfile: testAiProfile,
    translateBatch: translateAiBatch,
    cancelJob: cancelAiJob,
    listenToProgress: listenToAiProgress,
    listenToStream: listenToAiStream,
    readCache: readAiTranslationCache,
    writeCache: writeAiTranslationCache,
    getCacheStats: getAiTranslationCacheStats,
    clearCache: clearAiTranslationCache,
  }
}

/** AI platform Provider component: creates an AiPort and injects it into AiProvider. */
export function AiPlatformProvider({ children }: { children: ReactNode }) {
  const port = useMemo(createAiPort, [])
  return <AiProvider port={port}>{children}</AiProvider>
}
