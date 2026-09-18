import type { AiProviderProfile } from '@shared/contracts'
import { truncateLogExcerpt, type SmapiLogError } from './gameLogErrors'

/**
 * @file AI provider request building for the Android launcher's game-log error
 * analysis on top of the existing workbench AI settings. The analysis consumes
 * the workbench default profile (same profiles the translation editor and AI
 * settings panel manage), so credentials never reach this layer — the native
 * `android:ai_request` proxy resolves the stored key by profileId. Pure
 * functions only — no host calls — so request building and response extraction
 * are unit-testable.
 */

/** Serialized provider request handed to the native HTTP proxy. */
export type LogAnalysisAiRequest = {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: string
}

/**
 * True when a workbench profile can drive an analysis call: a model is set and
 * either the credential is stored or the preset works keyless (local providers).
 * `requiresApiKey` comes from the matching preset entry in the settings snapshot.
 */
export function isLogAnalysisProfileReady(profile: AiProviderProfile | null | undefined, requiresApiKey: boolean): boolean {
  if (!profile) {
    return false
  }
  if (!profile.model.trim()) {
    return false
  }
  return profile.keyConfigured || !requiresApiKey
}

/**
 * Builds the provider request for a single-user-message prompt from a workbench
 * profile. Auth headers are intentionally absent — the native proxy attaches
 * the stored credential via `profileId`. Returns null when the profile cannot
 * produce a request (unknown protocol, empty model or base URL).
 */
export function buildLogAnalysisAiRequest(profile: AiProviderProfile, prompt: string): LogAnalysisAiRequest | null {
  const model = profile.model.trim()
  const baseUrl = profile.baseUrl.trim().replace(/\/+$/, '')
  if (!model || !baseUrl) {
    return null
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' }

  let url: string
  let body: Record<string, unknown>
  switch (profile.protocol) {
    case 'openai-chat-completions':
      url = `${baseUrl}/chat/completions`
      body = { model, messages: [{ role: 'user', content: prompt }] }
      break
    case 'openai-responses':
      url = `${baseUrl}/responses`
      body = { model, input: prompt }
      break
    case 'anthropic-messages':
      url = `${baseUrl}/messages`
      body = { model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }
      break
    default:
      return null
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
export function extractLogAnalysisAiText(protocol: AiProviderProfile['protocol'], responseBody: string): string | null {
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
