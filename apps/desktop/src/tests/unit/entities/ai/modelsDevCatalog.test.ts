import { describe, expect, it } from 'vite-plus/test'
import { findModelsDevEntry, formatAiTokenCount, modelsDevProviderForPreset, searchModelsDevCatalog } from '@entities/ai'
import type { ModelsDevCatalog } from '@shared/contracts'

const catalog: ModelsDevCatalog = {
  fetchedAtMs: 1,
  providers: [
    {
      id: 'anthropic',
      name: 'Anthropic',
      models: [
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindowTokens: 200000, maxOutputTokens: 8192 },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextWindowTokens: 200000, maxOutputTokens: 4096 },
      ],
    },
    {
      id: 'openai',
      name: 'OpenAI',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', contextWindowTokens: 128000, maxOutputTokens: 16384 },
        { id: 'gpt-4o-mini', name: null, contextWindowTokens: 128000, maxOutputTokens: null },
      ],
    },
    {
      id: 'google',
      name: 'Google',
      models: [{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindowTokens: 1000000, maxOutputTokens: 8192 }],
    },
  ],
}

describe('searchModelsDevCatalog', () => {
  it('returns every model for an empty query', () => {
    const entries = searchModelsDevCatalog(catalog, 'openai', '')
    expect(entries).toHaveLength(5)
    // The provider matching the current preset is pinned first.
    expect(entries.slice(0, 2).map((entry) => entry.providerId)).toEqual(['openai', 'openai'])
    expect(entries[0]?.model.id).toBe('gpt-4o')
    expect(entries[1]?.model.id).toBe('gpt-4o-mini')
  })

  it('pins the aliased models.dev provider for renamed presets', () => {
    const entries = searchModelsDevCatalog(catalog, 'gemini', '')
    expect(entries[0]?.providerId).toBe('google')
    expect(entries[0]?.model.id).toBe('gemini-2.0-flash')
    expect(modelsDevProviderForPreset(catalog, 'gemini')?.name).toBe('Google')
  })

  it('filters by model id case-insensitively', () => {
    const entries = searchModelsDevCatalog(catalog, 'openai', 'GPT-4O-MINI')
    expect(entries.map((entry) => entry.model.id)).toEqual(['gpt-4o-mini'])
  })

  it('matches against the display name too', () => {
    const entries = searchModelsDevCatalog(catalog, 'anthropic', 'haiku')
    expect(entries.map((entry) => entry.model.id)).toEqual(['claude-3-haiku-20240307'])
  })

  it('falls back to provider order when the preset has no provider match', () => {
    // `ollama` aliases to `ollama-cloud`, which is absent from this catalog.
    const entries = searchModelsDevCatalog(catalog, 'ollama', '')
    expect(entries[0]?.providerId).toBe('anthropic')
    const ids = entries.map((entry) => `${entry.providerId}/${entry.model.id}`)
    expect(ids).toEqual([
      'anthropic/claude-3-5-sonnet-20241022',
      'anthropic/claude-3-haiku-20240307',
      'google/gemini-2.0-flash',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
    ])
  })

  it('returns no entries when nothing matches', () => {
    expect(searchModelsDevCatalog(catalog, 'openai', 'does-not-exist')).toEqual([])
  })
})

describe('catalog lookups', () => {
  it('finds a model across providers', () => {
    expect(findModelsDevEntry(catalog, 'openai', 'gpt-4o')?.contextWindowTokens).toBe(128000)
    expect(findModelsDevEntry(catalog, 'openai', 'claude-3-5-sonnet-20241022')).toBeNull()
    expect(findModelsDevEntry(catalog, 'unknown', 'gpt-4o')).toBeNull()
  })

  it('resolves the provider for a preset id', () => {
    expect(modelsDevProviderForPreset(catalog, 'openai')?.name).toBe('OpenAI')
    expect(modelsDevProviderForPreset(catalog, 'ollama')).toBeNull()
  })
})

describe('formatAiTokenCount', () => {
  it('formats compact token counts', () => {
    expect(formatAiTokenCount(128000)).toBe('128k')
    expect(formatAiTokenCount(16000)).toBe('16k')
    expect(formatAiTokenCount(200000)).toBe('200k')
    expect(formatAiTokenCount(1000000)).toBe('1M')
    expect(formatAiTokenCount(1500000)).toBe('1.5M')
    expect(formatAiTokenCount(512)).toBe('512')
  })
})
