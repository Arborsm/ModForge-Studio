/**
 * @file Browser-only Android WebView host mock: fabricates `window.modforgeBridge` so
 * `vp run web:dev` can exercise the Android platform adapter without a native host.
 * @module platform/android/devAndroidMock
 */

import { createDevLauncherMockIpcHandler } from '@platform/tauri/devLauncherMock'
import { dispatchAndroidHostEvent } from './index'

const DEV_ANDROID_MOCK_QUERY_PARAM = 'mfAndroidMock'
/** Fake SAF picker results; mirrors the launcher dev mock's import fixtures. */
const DEV_ANDROID_PICK_FILE_RESULT = 'E:\\ModForge Dev\\Imports\\Dev Mod Pack.zip'
const DEV_ANDROID_PICK_DIRECTORY_RESULT = 'E:\\ModForge Dev\\Imports'
const DEV_ANDROID_CREATE_DOCUMENT_RESULT = 'E:\\ModForge Dev\\Exports\\export.zip'
/** Assistant text the mock AI provider returns; the log-analysis pipeline surfaces it verbatim. */
const DEV_ANDROID_AI_FIXTURE_TEXT = 'Dev mock AI response: the mocked provider parsed the prompt and returned this fixture text.'

function shouldEnableAndroidDevMock() {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return false
  }
  return new URLSearchParams(window.location.search).get(DEV_ANDROID_MOCK_QUERY_PARAM) === '1'
}

/**
 * Installs a query-param gated (`?mfAndroidMock=1`) mock of the Android WebView
 * bridge. Host commands reuse the launcher dev mock's data source so the UI runs
 * against the same fixtures as the Tauri browser mock; dialog commands return
 * fixed SAF-shaped results. Events flow through the adapter's dispatch sink as
 * `{event, payload}` frames, matching the C# host behavior.
 *
 * Returns whether the mock was installed; callers use the result to skip the
 * Tauri dev mock so exactly one host is fabricated per page load.
 */
export function installAndroidDevMock() {
  if (!shouldEnableAndroidDevMock() || typeof window === 'undefined') {
    return false
  }
  if ('modforgeBridge' in window) {
    return true
  }

  const handleLauncherCommand = createDevLauncherMockIpcHandler(async (event, payload) => {
    dispatchAndroidHostEvent(event, payload)
  })

  const deliver = async (command: string, argsJson: string, callbackId: string) => {
    let frame: { id: string; ok: boolean; payload?: unknown }
    try {
      const args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {}
      const payload = await handleAndroidMockCommand(command, args, handleLauncherCommand)
      frame = { id: callbackId, ok: true, payload }
    } catch (error) {
      frame = { id: callbackId, ok: false, payload: error instanceof Error ? error.message : String(error) }
    }
    window.__modforgeDispatch?.(frame)
  }

  window.modforgeBridge = {
    backHandled() {
      //The dev mock has no activity to notify.
    },
    invokeCommand(command, argsJson, callbackId) {
      // The real host executes on a background queue and dispatches later;
      // the mock keeps the same async contract so promise timing is honest.
      window.setTimeout(() => {
        void deliver(command, argsJson, callbackId)
      }, 0)
    },
  }
  return true
}

async function handleAndroidMockCommand(
  command: string,
  args: Record<string, unknown>,
  handleLauncherCommand: (command: string, payload: unknown) => Promise<unknown>,
): Promise<unknown> {
  switch (command) {
    case 'android:pick_file':
      return args.multiple === true ? [DEV_ANDROID_PICK_FILE_RESULT] : DEV_ANDROID_PICK_FILE_RESULT
    case 'android:pick_dir':
      return DEV_ANDROID_PICK_DIRECTORY_RESULT
    case 'android:create_document':
      return DEV_ANDROID_CREATE_DOCUMENT_RESULT
    case 'android:set_system_bars':
      // Cosmetic native chrome has no browser equivalent; accept and ignore.
      return null
    case 'android:set_dev_server':
      // The browser page already comes from the dev server, and there is no
      // activity to recreate; accept and ignore so the settings card works.
      return null
    case 'android:open_in_app_browser': {
      // The dev mock has no native overlay; a browser tab mirrors the real
      // overlay's link flow (download capture stays a native-only feature).
      const url = typeof args.url === 'string' ? args.url : ''
      if (!/^https?:\/\//i.test(url)) {
        throw new Error('open_in_app_browser requires an absolute http(s) URL.')
      }
      window.open(url, '_blank', 'noopener')
      return null
    }
    case 'android:ai_request': {
      // Delegate to the launcher dev mock's AI fixtures: shape a provider-style
      // response per protocol so the log-analysis parser reads it like a real
      // host reply. GET serves an OpenAI-style model list.
      const url = typeof args.url === 'string' ? args.url : ''
      const method = args.method === 'GET' || args.method === 'POST' ? args.method : null
      if (!url || !method) {
        throw new Error('ai_request requires an absolute http(s) URL and a GET/POST method.')
      }
      if (method === 'GET') {
        return {
          statusCode: 200,
          body: JSON.stringify({ data: [{ id: 'gpt-4.1-mini' }, { id: 'qwen2.5:14b' }] }),
        }
      }
      return { statusCode: 200, body: JSON.stringify(buildMockProviderResponseBody(url)) }
    }
    default:
      return handleLauncherCommand(command, args)
  }
}

/** Builds a provider-shaped success body the same way a real provider would reply. */
function buildMockProviderResponseBody(url: string): Record<string, unknown> {
  // anthropic-messages endpoints end in /messages, openai-responses in /responses;
  // every other path is treated as an OpenAI chat-completions response.
  if (url.endsWith('/messages')) {
    return { id: 'msg_mock', type: 'message', role: 'assistant', content: [{ type: 'text', text: DEV_ANDROID_AI_FIXTURE_TEXT }] }
  }
  if (url.endsWith('/responses')) {
    return { id: 'resp_mock', output_text: DEV_ANDROID_AI_FIXTURE_TEXT }
  }
  return { id: 'chatcmpl-mock', choices: [{ index: 0, message: { role: 'assistant', content: DEV_ANDROID_AI_FIXTURE_TEXT } }] }
}
