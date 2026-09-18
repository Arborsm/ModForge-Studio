import { describe, expect, it } from 'vite-plus/test'
import {
  buildLogAnalysisAiRequest,
  buildLogAnalysisPrompt,
  extractLogAnalysisAiText,
  findLogAnalysisProvider,
  isLogAnalysisAiConfigReady,
  LOG_ANALYSIS_PROVIDERS,
} from '@features/launcher/model/logAnalysisAi'

describe('logAnalysisAi config readiness', () => {
  it('reports ready for a complete config', () => {
    expect(isLogAnalysisAiConfigReady({ providerId: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-1' })).toBe(true)
  })

  it('reports not ready for missing key, model, or unknown provider', () => {
    expect(isLogAnalysisAiConfigReady({ providerId: 'openai', model: 'gpt-4o-mini', apiKey: ' ' })).toBe(false)
    expect(isLogAnalysisAiConfigReady({ providerId: 'openai', model: '', apiKey: 'sk-1' })).toBe(false)
    expect(isLogAnalysisAiConfigReady({ providerId: 'nope', model: 'm', apiKey: 'sk-1' })).toBe(false)
    expect(isLogAnalysisAiConfigReady(null)).toBe(false)
  })

  it('resolves providers by id', () => {
    expect(findLogAnalysisProvider('anthropic')?.protocol).toBe('anthropic-messages')
    expect(findLogAnalysisProvider('nope')).toBeNull()
    expect(LOG_ANALYSIS_PROVIDERS.length).toBeGreaterThanOrEqual(3)
  })
})

describe('buildLogAnalysisAiRequest', () => {
  const prompt = 'Explain this SMAPI error.'

  it('builds an OpenAI Responses request', () => {
    const request = buildLogAnalysisAiRequest({ providerId: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-1' }, prompt)
    expect(request).not.toBeNull()
    expect(request!.url).toBe('https://api.openai.com/v1/responses')
    expect(request!.method).toBe('POST')
    expect(request!.headers.authorization).toBe('Bearer sk-1')
    const body = JSON.parse(request!.body)
    expect(body).toEqual({ model: 'gpt-4o-mini', input: prompt })
  })

  it('builds a chat-completions request with the messages payload', () => {
    const request = buildLogAnalysisAiRequest({ providerId: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-2' }, prompt)
    const body = JSON.parse(request!.body)
    expect(request!.url).toBe('https://api.deepseek.com/chat/completions')
    expect(body.messages).toEqual([{ role: 'user', content: prompt }])
  })

  it('builds an Anthropic Messages request with x-api-key auth', () => {
    const request = buildLogAnalysisAiRequest({ providerId: 'anthropic', model: 'claude-sonnet-4-5', apiKey: 'key-3' }, prompt)
    expect(request!.url).toBe('https://api.anthropic.com/v1/messages')
    expect(request!.headers['x-api-key']).toBe('key-3')
    expect(request!.headers['anthropic-version']).toBe('2023-06-01')
    expect(request!.headers.authorization).toBeUndefined()
    const body = JSON.parse(request!.body)
    expect(body.max_tokens).toBe(2048)
    expect(body.messages).toEqual([{ role: 'user', content: prompt }])
  })

  it('returns null for an incomplete config', () => {
    expect(buildLogAnalysisAiRequest({ providerId: 'openai', model: '', apiKey: 'sk-1' }, prompt)).toBeNull()
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
