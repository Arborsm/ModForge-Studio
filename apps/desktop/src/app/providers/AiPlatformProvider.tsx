import { useMemo, type ReactNode } from 'react'
import { AiProvider } from '@entities/ai'
import type { AiPort } from '@shared/contracts'
import {
  cancelAiJob,
  clearAiTranslationCache,
  getAiTranslationCacheStats,
  listAiModels,
  listenToAiProgress,
  loadAiSettings,
  readAiTranslationCache,
  saveAiSettings,
  testAiProfile,
  translateAiBatch,
  writeAiTranslationCache,
} from '@platform/host'

function createAiPort(): AiPort {
  return {
    loadSettings: loadAiSettings,
    saveSettings: saveAiSettings,
    listModels: listAiModels,
    testProfile: testAiProfile,
    translateBatch: translateAiBatch,
    cancelJob: cancelAiJob,
    listenToProgress: listenToAiProgress,
    readCache: readAiTranslationCache,
    writeCache: writeAiTranslationCache,
    getCacheStats: getAiTranslationCacheStats,
    clearCache: clearAiTranslationCache,
  }
}

export function AiPlatformProvider({ children }: { children: ReactNode }) {
  const port = useMemo(createAiPort, [])
  return <AiProvider port={port}>{children}</AiProvider>
}
