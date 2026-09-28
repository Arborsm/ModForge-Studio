/**
 * @file Architecture gate for the browser dev mock's host-command coverage.
 *
 * The dev mock (`?mfLauncherMock=1` / `?mfAndroidMock=1`) is the front-end's
 * only runtime without a native host, so every command the UI can dispatch
 * must either have a mock case arm or sit on a documented whitelist below —
 * otherwise it throws `Unhandled dev launcher mock command` mid-demo. The
 * whitelist is a migration list like the backend architecture one: a command
 * that gains a mock must remove its entry in the same change, and new host
 * commands force an explicit choice (mock arm or justified whitelist entry).
 */
import { resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { HOST_COMMANDS } from '@platform/host-commands'
import { readSourceFileCached } from '@test/sourceScan'

function mockSourcePath(...segments: string[]) {
  return resolve(process.cwd(), ...segments)
}

/** Files whose `case '...'` literal dispatch arms implement the dev mock. */
const DEV_MOCK_SOURCES = [
  'src/platform/tauri/devLauncherMock.ts',
  'src/platform/tauri/devLauncherMockCpMaker.ts',
  'src/platform/tauri/devLauncherMockLocalization.ts',
  'src/platform/tauri/devLauncherMockModTranslation.ts',
  'src/platform/android/devAndroidMock.ts',
] as const

/**
 * Hand-written `android:*` bridge commands from the C# `ModForgeBridge` /
 * `devAndroidMock` pair; they are not part of the generated HOST_COMMANDS map
 * because the desktop protocol does not carry host-private commands. Keep this
 * list in sync with the `android:*` command consts in `ModForgeBridge.cs` —
 * the sibling repo is not visible from this test.
 */
const ANDROID_BRIDGE_COMMANDS = [
  'android:pick_file',
  'android:pick_dir',
  'android:create_document',
  'android:set_system_bars',
  'android:open_in_app_browser',
  'android:ai_request',
  'android:set_dev_server',
] as const

/**
 * Tauri plugin IPC channels the same mock switch also dispatches (e.g. the
 * dialog plugin); they are neither generated host commands nor android bridge
 * commands but are legitimate mock arms.
 */
const TAURI_PLUGIN_MOCK_ARMS = ['plugin:dialog|open'] as const

/**
 * Commands intentionally left unmocked, grouped by reason. Semantics mirror the
 * backend architecture whitelist: entries are migration debt, not a permanent
 * exemption — the companion assertion fails the moment one of them gains a
 * mock so the entry gets deleted in the same change.
 */
const MOCK_COVERAGE_WHITELIST: Record<string, { reason: string; commands: string[] }> = {
  'debug-bridge': {
    reason:
      'Debug-bridge tooling drives the real desktop WebView/plugin host through the dev-tools bridge; there is nothing meaningful to fake in a pure browser page.',
    commands: [
      'get_debug_bridge_mod_state',
      'get_debug_bridge_status',
      'install_debug_bridge_mod',
      'send_debug_bridge_command',
      'set_debug_logging_enabled',
    ],
  },
  'file-cache': {
    reason:
      'File-cache statistics live in the native host cache manager; get_file_cache_stats deliberately stays unmocked so the settings debug toggle remains a live host-error probe.',
    commands: ['clear_file_cache', 'get_file_cache_stats'],
  },
  'compat-plugins': {
    reason:
      'Compat-plugin management edits plugin manifests inside real desktop install roots; the browser mock has no plugin filesystem to edit.',
    commands: [
      'delete_compat_plugin',
      'delete_compat_plugin_entry',
      'get_compat_plugin_roots',
      'list_compat_plugin_entries',
      'list_compat_plugins',
      'read_compat_plugin_entry',
      'read_plugin_asset',
      'reload_compat_plugins',
      'toggle_compat_plugin',
      'write_compat_plugin_entry',
      'write_compat_plugin_entry_image',
    ],
  },
  'launcher-install-download-archive': {
    reason:
      'Archive install, download and game launch mutate the real Mods directory or start processes; their flows are verified against the desktop shell and the Android launcher, not the browser mock.',
    commands: [
      'cancel_launcher_download',
      'download_launcher_mod',
      'inspect_launcher_archive',
      'inspect_mod_archive',
      'install_launcher_archive',
      'launch_launcher_game',
      'list_launcher_install_backups',
      'restore_launcher_install_backup',
    ],
  },
  'launcher-images': {
    reason:
      'Image resolution streams bytes from the native resolver cache and the Nexus CDN through host-side throttling; the mock serves catalog fixtures with image URLs instead.',
    commands: [
      'clear_launcher_image_cache',
      'load_launcher_image_failures',
      'persist_launcher_library_remote_cover',
      'resolve_cached_launcher_image',
      'resolve_launcher_image',
      'set_launcher_library_cover',
    ],
  },
  'resource-file-helpers': {
    reason:
      'Raw file and asset helpers read the real game data folder / write user-chosen exports; the dev asset bridge (`?mfMockGameRoot=`) covers the game-data side and export targets need a host save dialog.',
    commands: [
      'export_file',
      'export_map_png',
      'import_cp_maker_pack',
      'load_content_patcher_result_asset',
      'load_resource_registry',
      'load_text_file',
      'load_xact_audio_data_url',
      'scan_mod_asset_index',
    ],
  },
  misc: {
    reason:
      'One-off flows that only make sense against a real backend: update changelogs from the live SMAPI repo, save-slot scans of an installed game, diagnostics retry sweeps, and the heavy localization/MT batch pipelines whose state mocks already cover.',
    commands: [
      'cancel_localization_job',
      'load_launcher_update_changelog',
      'retry_launcher_nexus_diagnostics_route',
      'review_localization_batch',
      'scan_default_save_slots',
      'translate_machine_translation_batch',
    ],
  },
}

function extractCaseArms(source: string): string[] {
  return [...source.matchAll(/case '([^']+)'/g)].map((match) => match[1])
}

function collectExpectedCommands(): string[] {
  return [...Object.values(HOST_COMMANDS), ...ANDROID_BRIDGE_COMMANDS]
}

describe('dev launcher mock host-command coverage', () => {
  async function collectMockedCommands(): Promise<Set<string>> {
    const mocked = new Set<string>()
    for (const sourcePath of DEV_MOCK_SOURCES) {
      const source = await readSourceFileCached(mockSourcePath(sourcePath))
      for (const arm of extractCaseArms(source)) {
        mocked.add(arm)
      }
    }
    return mocked
  }

  it('covers every host command with a mock arm or a whitelist entry', async () => {
    const mocked = await collectMockedCommands()

    const expected = collectExpectedCommands()
    const whitelisted = new Set(Object.values(MOCK_COVERAGE_WHITELIST).flatMap((group) => group.commands))
    const uncovered = expected.filter((command) => !mocked.has(command) && !whitelisted.has(command))

    expect(
      uncovered,
      'These host commands have neither a dev-mock case arm nor a whitelist entry — add a mock arm or justify the gap in MOCK_COVERAGE_WHITELIST.',
    ).toEqual([])
  })

  it('keeps the whitelist minimal: whitelisted commands must not silently gain a mock', async () => {
    const mocked = await collectMockedCommands()

    const stale = Object.values(MOCK_COVERAGE_WHITELIST)
      .flatMap((group) => group.commands)
      .filter((command) => mocked.has(command))

    expect(stale, 'These whitelisted commands now have dev-mock case arms — delete their whitelist entries in the same change.').toEqual([])
  })

  it('keeps mock arms on-protocol: every case arm maps to a real host command', async () => {
    const expected = new Set([...collectExpectedCommands(), ...TAURI_PLUGIN_MOCK_ARMS])
    const unknown: string[] = []

    for (const sourcePath of DEV_MOCK_SOURCES) {
      const source = await readSourceFileCached(mockSourcePath(sourcePath))
      for (const arm of extractCaseArms(source)) {
        if (!expected.has(arm)) {
          unknown.push(`${sourcePath}: ${arm}`)
        }
      }
    }

    expect(
      unknown,
      'These dev-mock case arms do not match any generated host command or android bridge command — a typo would make the arm unreachable.',
    ).toEqual([])
  })
})
