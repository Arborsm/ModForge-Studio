import type { ModelsDevCatalog, ModelsDevModelEntry, ModelsDevProviderEntry } from '@shared/contracts'

export type ModelsDevSearchEntry = {
  providerId: string
  providerName: string
  model: ModelsDevModelEntry
}

/**
 * Best-effort mapping from app preset ids to models.dev provider ids. Exact
 * matches (openai, anthropic, deepseek, groq, mistral, openrouter, xai,
 * siliconflow-cn, siliconflow) need no alias; these cover the renamed ones.
 * Presets without a catalog entry (e.g. local ollama) simply show every
 * provider and rely on the search box.
 */
const MODELS_DEV_PROVIDER_ALIASES: Record<string, string> = {
  gemini: 'google',
  moonshot: 'moonshotai-cn',
  'qwen-cn': 'alibaba-cn',
  'qwen-intl': 'alibaba',
  zhipu: 'zhipuai',
  'lm-studio': 'lmstudio',
  ollama: 'ollama-cloud',
}

function resolveModelsDevProviderId(presetId: string): string {
  return MODELS_DEV_PROVIDER_ALIASES[presetId] ?? presetId
}

/**
 * Flattens the catalog into searchable entries, filtering by model id/name and
 * pinning the provider matching the current profile's preset id first (with
 * preset→models.dev aliases applied). Matching provider models are listed
 * before other providers; within a provider, models sort by id. An empty query
 * returns the pinned provider's models first, then every other provider in
 * catalog order.
 */
export function searchModelsDevCatalog(catalog: ModelsDevCatalog, presetId: string, query: string): ModelsDevSearchEntry[] {
  const pinnedProviderId = resolveModelsDevProviderId(presetId)
  const needle = query.trim().toLocaleLowerCase()
  const entries: ModelsDevSearchEntry[] = []
  for (const provider of catalog.providers) {
    for (const model of provider.models) {
      const haystack = `${model.id} ${model.name ?? ''}`.toLocaleLowerCase()
      if (needle && !haystack.includes(needle)) continue
      entries.push({ providerId: provider.id, providerName: provider.name, model })
    }
  }
  entries.sort((left, right) => {
    const leftPinned = left.providerId === pinnedProviderId ? 0 : 1
    const rightPinned = right.providerId === pinnedProviderId ? 0 : 1
    if (leftPinned !== rightPinned) return leftPinned - rightPinned
    if (left.providerId !== right.providerId) return left.providerId.localeCompare(right.providerId)
    return left.model.id.localeCompare(right.model.id)
  })
  return entries
}

/** Finds a model across the whole catalog; returns `null` when unknown. */
export function findModelsDevEntry(catalog: ModelsDevCatalog, providerId: string, modelId: string): ModelsDevModelEntry | null {
  const provider = catalog.providers.find((item) => item.id === providerId)
  return provider?.models.find((model) => model.id === modelId) ?? null
}

/** True when the preset id matches a provider present in the catalog (aliases applied). */
export function modelsDevProviderForPreset(catalog: ModelsDevCatalog, presetId: string): ModelsDevProviderEntry | null {
  return catalog.providers.find((provider) => provider.id === resolveModelsDevProviderId(presetId)) ?? null
}

/** Formats a token count compactly (e.g. `128k`) for list rows. */
export function formatAiTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`
  return String(value)
}
