import type { AiUsageClearResult, AiUsageQuery, AiUsageRecordPage, AiUsageSummary } from '@shared/contracts'
import { HOST_COMMANDS } from '@platform/host-commands'
import { invokeDesktop } from './runtime'

const queryKey = (query: AiUsageQuery) => JSON.stringify(query)

/** Loads aggregate usage without exposing prompts or translated text. */
export function queryAiUsageSummary(request: AiUsageQuery) {
  return invokeDesktop<AiUsageSummary>(
    HOST_COMMANDS.queryAiUsageSummary,
    { request },
    { kind: 'keyedLatest', key: `ai-usage-summary:${queryKey(request)}` },
  )
}

/** Loads one server-paginated page of attempt-level usage metadata. */
export function queryAiUsageRecords(request: AiUsageQuery) {
  return invokeDesktop<AiUsageRecordPage>(
    HOST_COMMANDS.queryAiUsageRecords,
    { request },
    { kind: 'keyedLatest', key: `ai-usage-records:${queryKey(request)}` },
  )
}

/** Exports the current usage filter to a host-validated destination path. */
export function exportAiUsage(request: AiUsageQuery, destinationPath: string) {
  return invokeDesktop<number>(
    HOST_COMMANDS.exportAiUsage,
    { request: { query: request, destinationPath } },
    { kind: 'exclusiveMutation', resource: 'AiUsageLedger' },
  )
}

/** Applies the selected retention operation to the independent usage ledger. */
export function clearAiUsage(mode: 'detail-older-than90-days' | 'all') {
  return invokeDesktop<AiUsageClearResult>(
    HOST_COMMANDS.clearAiUsage,
    { request: { mode } },
    { kind: 'exclusiveMutation', resource: 'AiUsageLedger' },
  )
}
