import { type ReactNode } from 'react'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
import { LauncherProvider } from '@features/launcher/model/launcherProvider'
import { createMockLauncherPort } from './launcherTestPort'
import { AiProvider } from '@entities/ai'
import type { AiPort } from '@shared/contracts'

const testAiPort: AiPort = {
  loadSettings: async () => ({ version: 1, defaultProfileId: null, profiles: [], presets: [] }),
  saveSettings: async () => ({ version: 1, defaultProfileId: null, profiles: [], presets: [] }),
  listModels: async () => [],
  testProfile: async () => ({
    provider: 'local',
    protocol: 'openai-chat-completions',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: '',
    latencyMs: 0,
    credentialSource: null,
  }),
  exportProfiles: async () => 0,
  previewProfilesImport: async () => ({ formatVersion: 1, credentialsExcluded: true, entries: [] }),
  applyProfilesImport: async () => ({
    settings: { version: 1, defaultProfileId: null, profiles: [], presets: [] },
    imported: 0,
    overwritten: 0,
    copied: 0,
    skipped: 0,
  }),
  translateBatch: async (request) => ({
    jobId: request.jobId,
    profileId: '',
    model: '',
    usageRecordState: 'recorded',
    knowledgeTrace: { officialMatches: 0, globalGlossaryMatches: 0, projectGlossaryMatches: 0, translationMemoryMatches: 0 },
    knowledgeRevision: 'disabled',
    items: request.items.map((item) => ({ id: item.id, translatedText: item.text, detectedLanguage: null, skippedSameLanguage: false })),
  }),
  cancelJob: async () => undefined,
  listenToProgress: async () => () => undefined,
  readCache: async () => null,
  writeCache: async (entry) => entry,
  getCacheStats: async () => ({ entryCount: 0, sizeBytes: 0 }),
  clearCache: async () => ({ entryCount: 0, sizeBytes: 0 }),
}

export type LauncherTestWrapperProps = {
  children: ReactNode
  port?: LauncherPort
}

export function LauncherTestWrapper({ children, port }: LauncherTestWrapperProps) {
  return (
    <AiProvider port={testAiPort}>
      <LauncherProvider port={port ?? createMockLauncherPort()}>{children}</LauncherProvider>
    </AiProvider>
  )
}
