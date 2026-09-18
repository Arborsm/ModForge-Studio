import type { AiAuthentication, AiProtocol } from '@shared/contracts'
import { truncateLogExcerpt, type SmapiLogError } from './gameLogErrors'

/**
 * @file Self-contained AI provider access for the Android launcher's game-log
 * error analysis. The workbench AI settings (profiles, presets, keychain-backed
 * credentials) are desktop-backend commands that do not exist on the Android
 * bridge, so this module carries its own minimal provider list and builds the
 * provider request for the three wire protocols directly; only the authenticated
 * HTTP hop goes through the native `android:ai_request` proxy. Pure functions
 * only — no host calls — so request building and response extraction are
 * unit-testable. Note: the API key is stored in the app UI state file (plain
 * JSON), unlike the desktop keychain; acceptable for the mobile host but not
 * to be reused for the desktop flow.
 */

/** Built-in provider choice offered by the log-analysis setup sheet. */
export type LogAnalysisProvider = {
  id: string
  name: string
  protocol: AiProtocol
  baseUrl: string
  authentication: AiAuthentication
  defaultModel: string
}

export const LOG_ANALYSIS_PROVIDERS: LogAnalysisProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai-responses',
    baseUrl: 'https://api.openai.com/v1',
    authentication: 'bearer',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    protocol: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com/v1',
    authentication: 'anthropic-api-key',
    defaultModel: 'claude-sonnet-4-5',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai-chat-completions',
    baseUrl: 'https://api.deepseek.com',
    authentication: 'bearer',
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    protocol: 'openai-chat-completions',
    baseUrl: 'https://openrouter.ai/api/v1',
    authentication: 'bearer',
    defaultModel: 'openai/gpt-4o-mini',
  },
]

/** Persisted user configuration for log-analysis AI calls. */
export type LogAnalysisAiConfig = {
  providerId: string
  model: string
  apiKey: string
}

/** Serialized provider request handed to the native HTTP proxy. */
export type LogAnalysisAiRequest = {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: string
}

export function findLogAnalysisProvider(providerId: string): LogAnalysisProvider | null {
  return LOG_ANALYSIS_PROVIDERS.find((provider) => provider.id === providerId) ?? null
}

/** True when the config can produce a request (provider known, model and key present). */
export function isLogAnalysisAiConfigReady(config: LogAnalysisAiConfig | null): boolean {
  if (!config) {
    return false
  }
  const provider = findLogAnalysisProvider(config.providerId)
  return Boolean(provider && config.model.trim() && config.apiKey.trim())
}

/**
 * Builds the provider request for a single-user-message prompt. Returns null when
 * the config is incomplete; throws nothing (the UI gates on
 * {@link isLogAnalysisAiConfigReady} first).
 */
export function buildLogAnalysisAiRequest(config: LogAnalysisAiConfig, prompt: string): LogAnalysisAiRequest | null {
  const provider = findLogAnalysisProvider(config.providerId)
  const model = config.model.trim()
  const apiKey = config.apiKey.trim()
  if (!provider || !model || !apiKey) {
    return null
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (provider.authentication === 'bearer') {
    headers.authorization = `Bearer ${apiKey}`
  } else if (provider.authentication === 'anthropic-api-key') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  }

  let url: string
  let body: Record<string, unknown>
  switch (provider.protocol) {
    case 'openai-chat-completions':
      url = `${provider.baseUrl}/chat/completions`
      body = { model, messages: [{ role: 'user', content: prompt }] }
      break
    case 'openai-responses':
      url = `${provider.baseUrl}/responses`
      body = { model, input: prompt }
      break
    case 'anthropic-messages':
      url = `${provider.baseUrl}/messages`
      body = { model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }
      break
  }

  return { url, method: 'POST', headers, body: JSON.stringify(body) }
}

/**
 * Builds the analysis prompt for a batch of parsed SMAPI errors. The excerpt is
 * capped so the request stays well inside small-model context windows; the
 * answer language follows the app locale so the player can read the result.
 */
export function buildLogAnalysisPrompt(errors: SmapiLogError[], locale: string, maxChars = 6000): string {
  const language = locale.trim().toLowerCase().startsWith('zh') ? 'Simplified Chinese' : 'English'
  const excerpt = truncateLogExcerpt(errors.map((error) => error.raw).join('\n'), maxChars)
  return [
    'You are helping a Stardew Valley player diagnose SMAPI mod errors from the game log.',
    `The following ERROR lines were written during the most recent game session. Reply in ${language}, concisely, and cover:`,
    '- which mod (source) is responsible for each error',
    '- what the error means for the player',
    '- concrete fix steps (update, reconfigure, or remove the mod)',
    '',
    'Log excerpt:',
    excerpt,
  ].join('\n')
}

/**
 * Extracts the assistant text from a provider response body. Returns null when
 * the payload does not carry extractable text (callers surface the raw body
 * instead, never swallowing the failure).
 */
export function extractLogAnalysisAiText(protocol: AiProtocol, responseBody: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(responseBody)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }

  if (protocol === 'anthropic-messages') {
    const content = (parsed as { content?: unknown }).content
    if (!Array.isArray(content)) {
      return null
    }
    const texts = content
      .map((block) => (typeof block === 'object' && block !== null ? (block as { text?: unknown }).text : null))
      .filter((text): text is string => typeof text === 'string')
    return texts.length ? texts.join('\n') : null
  }

  if (protocol === 'openai-responses') {
    const outputText = (parsed as { output_text?: unknown }).output_text
    if (typeof outputText === 'string' && outputText.trim()) {
      return outputText
    }
    const output = (parsed as { output?: unknown }).output
    if (!Array.isArray(output)) {
      return null
    }
    const texts = output
      .flatMap((item) =>
        typeof item === 'object' && item !== null && (item as { type?: unknown }).type === 'message'
          ? ((item as { content?: unknown }).content ?? [])
          : [],
      )
      .map((block) => (typeof block === 'object' && block !== null ? (block as { text?: unknown }).text : null))
      .filter((text): text is string => typeof text === 'string')
    return texts.length ? texts.join('\n') : null
  }

  const choices = (parsed as { choices?: unknown }).choices
  if (!Array.isArray(choices) || !choices.length) {
    return null
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message
  return typeof message?.content === 'string' && message.content.trim() ? message.content : null
}
