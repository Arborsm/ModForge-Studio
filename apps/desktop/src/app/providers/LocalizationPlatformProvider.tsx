import { useMemo, type ReactNode } from 'react'
import { LocalizationProvider } from '@entities/localization'
import {
  cancelLocalizationJob,
  clearAiUsage,
  copyTranslationMemory,
  deleteLocalizationGlossary,
  deleteTranslationMemory,
  exportAiUsage,
  exportLocalizationKnowledge,
  importLocalizationKnowledge,
  inspectOfficialLocalizationIndex,
  listLocalizationGlossary,
  listLocalizationScopes,
  loadLocalizationScope,
  loadLocalizationStyle,
  queryAiUsageRecords,
  queryAiUsageSummary,
  rebuildOfficialLocalizationIndex,
  recordConfirmedTranslations,
  resolveLocalizationScope,
  rebindLocalizationScope,
  saveLocalizationScopeSettings,
  saveLocalizationStyle,
  searchOfficialLocalization,
  searchTranslationMemory,
  upsertLocalizationGlossary,
  loadMachineTranslationSettings,
  saveMachineTranslationSettings,
  listMachineTranslationLanguages,
  testMachineTranslationProfile,
  translateLocalizationBatch,
  listenToOfficialLocalizationIndexProgress,
  cancelAiJob,
  loadAiSettings,
  reviewLocalizationBatch,
  listLocalizationReviewRuns,
  loadLocalizationReviewRun,
  updateLocalizationReviewIssues,
} from '@platform/host'
import type { LocalizationPort } from '@shared/contracts'
import { usePlatformPorts } from './usePlatformPorts'

export function LocalizationPlatformProvider({ children }: { children: ReactNode }) {
  const { dialog } = usePlatformPorts()
  const port = useMemo<LocalizationPort>(
    () => ({
      loadDefaultEngine: async () => {
        const [aiSettings, mtSettings] = await Promise.all([loadAiSettings(), loadMachineTranslationSettings()])
        if (aiSettings.defaultProfileId) return { kind: 'generative-ai', profileId: aiSettings.defaultProfileId }
        return mtSettings.defaultProfileId &&
          mtSettings.profiles.some((profile) => profile.id === mtSettings.defaultProfileId && profile.enabled)
          ? { kind: 'machine-translation', profileId: mtSettings.defaultProfileId }
          : null
      },
      loadMachineTranslationSettings,
      saveMachineTranslationSettings,
      listMachineTranslationLanguages,
      testMachineTranslationProfile,
      translateBatch: translateLocalizationBatch,
      listenOfficialIndexProgress: listenToOfficialLocalizationIndexProgress,
      reviewBatch: reviewLocalizationBatch,
      listReviewRuns: listLocalizationReviewRuns,
      loadReviewRun: loadLocalizationReviewRun,
      updateReviewIssues: updateLocalizationReviewIssues,
      queryUsageSummary: queryAiUsageSummary,
      queryUsageRecords: queryAiUsageRecords,
      exportUsage: exportAiUsage,
      clearUsage: clearAiUsage,
      inspectOfficialIndex: inspectOfficialLocalizationIndex,
      chooseGameDirectory: () => dialog.chooseDirectory('Select the Stardew Valley game folder'),
      rebuildOfficialIndex: rebuildOfficialLocalizationIndex,
      searchOfficial: searchOfficialLocalization,
      cancelJob: async (jobId) => {
        await Promise.allSettled([cancelLocalizationJob(jobId), cancelAiJob(jobId)])
      },
      resolveScope: resolveLocalizationScope,
      rebindScope: rebindLocalizationScope,
      listScopes: listLocalizationScopes,
      loadScope: loadLocalizationScope,
      saveScopeSettings: saveLocalizationScopeSettings,
      listGlossary: listLocalizationGlossary,
      upsertGlossary: upsertLocalizationGlossary,
      deleteGlossary: deleteLocalizationGlossary,
      loadStyle: loadLocalizationStyle,
      saveStyle: saveLocalizationStyle,
      searchMemory: searchTranslationMemory,
      recordConfirmed: recordConfirmedTranslations,
      deleteMemory: deleteTranslationMemory,
      copyMemory: copyTranslationMemory,
      importKnowledge: importLocalizationKnowledge,
      exportKnowledge: exportLocalizationKnowledge,
      chooseKnowledgeImport: (format) =>
        dialog.chooseFile({
          filters: [
            {
              name: 'Localization knowledge',
              extensions: [format === 'knowledge-pack-json' ? 'json' : format === 'glossary-csv' ? 'csv' : 'tmx'],
            },
          ],
        }),
      chooseKnowledgeExport: (format) =>
        dialog.saveFile({
          defaultPath:
            format === 'knowledge-pack-json'
              ? 'modforge-knowledge.json'
              : format === 'glossary-csv'
                ? 'glossary.csv'
                : 'translation-memory.tmx',
          filters: [
            {
              name: 'Localization knowledge',
              extensions: [format === 'knowledge-pack-json' ? 'json' : format === 'glossary-csv' ? 'csv' : 'tmx'],
            },
          ],
        }),
    }),
    [dialog],
  )
  return <LocalizationProvider port={port}>{children}</LocalizationProvider>
}
