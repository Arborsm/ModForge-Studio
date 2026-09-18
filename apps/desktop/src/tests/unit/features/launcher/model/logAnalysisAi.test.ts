import { describe, expect, it } from 'vite-plus/test'
import type { AiProviderProfile } from '@shared/contracts'
import {
  buildLogAnalysisAiRequest,
  buildLogAnalysisPrompt,
  extractLogAnalysisAiText,
  isLogAnalysisProfileReady,
} from '@features/launcher/model/logAnalysisAi'

function profile(overrides: Partial<AiProviderProfile>): AiProviderProfile {
  return {
    id: 'p1',
    name: 'Default',
    presetId: 'openai',
    protocol: 'openai-responses',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    credentialEnvironment: 'OPENAI_API_KEY',
    allowInsecureHttp: false,
    contextWindowTokens: null,
    maxOutputTokens: null,
    temperature: null,
    topP: null,
    frequencyPenalty: null,
    presencePenalty: null,
    maxBatchBytes: null,
    enableReasoning: false,
    reasoningEffort: null,
    streamTranslation: false,
    keyConfigured: true,
    resolvedCredentialSource: 'keychain',
    ...overrides,
  }
}

describe('isLogAnalysisProfileReady', () => {
  it('reports ready for a profile with a model and a stored key', () => {
    expect(isLogAnalysisProfileReady(profile({}), true)).toBe(true)
  })

  it('reports ready for a keyless local preset profile without a stored key', () => {
    expect(isLogAnalysisProfileReady(profile({ presetId: 'ollama', keyConfigured: false }), false)).toBe(true)
  })

  it('reports not ready when the key is missing on a key-backed preset', () => {
    expect(isLogAnalysisProfileReady(profile({ keyConfigured: false }), true)).toBe(false)
  })

  it('reports not ready for a missing model or a missing profile', () => {
    expect(isLogAnalysisProfileReady(profile({ model: ' ' }), true)).toBe(false)
    expect(isLogAnalysisProfileReady(null, true)).toBe(false)
    expect(isLogAnalysisProfileReady(undefined, false)).toBe(false)
  })
})

describe('buildLogAnalysisAiRequest', () => {
  const prompt = 'Explain this SMAPI error.'

  it('builds an OpenAI Responses request without auth headers', () => {
    const request = buildLogAnalysisAiRequest(profile({}), prompt)
    expect(request).not.toBeNull()
    expect(request!.url).toBe('https://api.openai.com/v1/responses')
    expect(request!.method).toBe('POST')
    expect(request!.headers).toEqual({ 'content-type': 'application/json' })
    const body = JSON.parse(request!.body)
    expect(body).toEqual({ model: 'gpt-4o-mini', input: prompt })
  })

  it('builds a chat-completions request with the messages payload', () => {
    const request = buildLogAnalysisAiRequest(
      profile({ presetId: 'deepseek', protocol: 'openai-chat-completions', baseUrl: 'https://api.deepseek.com' }),
      prompt,
    )
    const body = JSON.parse(request!.body)
    expect(request!.url).toBe('https://api.deepseek.com/chat/completions')
    expect(body.messages).toEqual([{ role: 'user', content: prompt }])
  })

  it('builds an Anthropic Messages request with max_tokens and no x-api-key header', () => {
    const request = buildLogAnalysisAiRequest(
      profile({ presetId: 'anthropic', protocol: 'anthropic-messages', baseUrl: 'https://api.anthropic.com/v1' }),
      prompt,
    )
    expect(request!.url).toBe('https://api.anthropic.com/v1/messages')
    expect(request!.headers['x-api-key']).toBeUndefined()
    expect(request!.headers.authorization).toBeUndefined()
    const body = JSON.parse(request!.body)
    expect(body.max_tokens).toBe(2048)
    expect(body.messages).toEqual([{ role: 'user', content: prompt }])
  })

  it('trims a trailing slash from the profile base URL', () => {
    const request = buildLogAnalysisAiRequest(profile({ baseUrl: 'https://api.openai.com/v1/' }), prompt)
    expect(request!.url).toBe('https://api.openai.com/v1/responses')
  })

  it('returns null for an empty model or base URL', () => {
    expect(buildLogAnalysisAiRequest(profile({ model: '' }), prompt)).toBeNull()
    expect(buildLogAnalysisAiRequest(profile({ baseUrl: ' ' }), prompt)).toBeNull()
  })
})

describe('buildLogAnalysisPrompt', () => {
  const errors = [{ raw: '[06:30:16 ERROR  Some.Mod] boom', source: 'Some.Mod', message: 'boom' }]

  it('embeds the error lines and answers in the requested language', () => {
    const prompt = buildLogAnalysisPrompt(errors, 'zh-CN')
    expect(prompt).toContain('[06:30:16 ERROR  Some.Mod] boom')
    expect(prompt).toContain('Simplified Chinese')
    const english = buildLogAnalysisPrompt(errors, 'en-US')
    expect(english).toContain('Reply in English')
  })

  it('caps an oversized excerpt and marks the cut', () => {
    const many = Array.from({ length: 500 }, (_, index) => ({
      raw: `[06:30:16 ERROR  Mod${index}] failure`,
      source: `Mod${index}`,
      message: 'failure',
    }))
    const prompt = buildLogAnalysisPrompt(many, 'en-US', 1000)
    expect(prompt).toContain('… [truncated]')
    expect(prompt.length).toBeLessThan(1400)
  })
})

describe('extractLogAnalysisAiText', () => {
  it('extracts chat-completions message content', () => {
    const body = JSON.stringify({ choices: [{ message: { content: 'The mod is outdated.' } }] })
    expect(extractLogAnalysisAiText('openai-chat-completions', body)).toBe('The mod is outdated.')
  })

  it('extracts the responses output_text field', () => {
    const body = JSON.stringify({ output_text: 'Done.', output: [] })
    expect(extractLogAnalysisAiText('openai-responses', body)).toBe('Done.')
  })

  it('extracts responses from the output array as a fallback', () => {
    const body = JSON.stringify({
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', content: [{ type: 'output_text', text: 'Part one.' }] },
        { type: 'message', content: [{ type: 'output_text', text: 'Part two.' }] },
      ],
    })
    expect(extractLogAnalysisAiText('openai-responses', body)).toBe('Part one.\nPart two.')
  })

  it('extracts and joins Anthropic content blocks', () => {
    const body = JSON.stringify({
      content: [
        { type: 'text', text: 'A' },
        { type: 'text', text: 'B' },
      ],
    })
    expect(extractLogAnalysisAiText('anthropic-messages', body)).toBe('A\nB')
  })

  it('returns null for error payloads and non-JSON bodies', () => {
    expect(extractLogAnalysisAiText('openai-chat-completions', '{invalid')).toBeNull()
    expect(extractLogAnalysisAiText('openai-chat-completions', JSON.stringify({ error: 'boom' }))).toBeNull()
    expect(extractLogAnalysisAiText('openai-chat-completions', JSON.stringify({ choices: [] }))).toBeNull()
  })
})
