import assert from 'node:assert/strict'
import test from 'node:test'
import {
  APP_UI_LEGACY,
  NEXUSMODS_LAUNCHER_LEGACY,
  ROOT_FILES,
  analyzeBackendArchitecture,
  scanSourceTree,
} from './check-backend-architecture.mjs'

const fixture = (files) => new Map(Object.entries(files))
const ruleIds = (result) => result.violations.map((entry) => entry.rule)

void test('a clean tree produces no violations', () => {
  const result = analyzeBackendArchitecture(
    fixture({
      'domain/launcher/updates.rs': 'pub fn scan() {}\n',
      'infrastructure/fs.rs': 'pub fn read() {}\n',
      'lib.rs': 'mod domain;\n',
    }),
  )
  assert.deepEqual(result.violations, [])
  assert.deepEqual(result.legacy, [])
})

void test('R1 flags any crate::domain token in infrastructure', () => {
  const result = analyzeBackendArchitecture(
    fixture({
      'infrastructure/fs.rs': 'use crate::domain::launcher::types::LauncherSettings;\n',
      'infrastructure/shell.rs': 'let value = crate::domain::app_paths::app_cache_dir();\n',
    }),
  )
  assert.deepEqual(ruleIds(result), ['infrastructureMustNotTouchDomain', 'infrastructureMustNotTouchDomain'])
})

void test('R1 skips comment lines', () => {
  const result = analyzeBackendArchitecture(
    fixture({ 'infrastructure/fs.rs': '// future: crate::domain::launcher must stay out of here\n' }),
  )
  assert.deepEqual(result.violations, [])
})

void test('R2 allows the app_paths shared kernel in support but nothing else', () => {
  const allowed = analyzeBackendArchitecture(fixture({ 'support/logging/mod.rs': 'use crate::domain::app_paths::app_logs_dir;\n' }))
  assert.deepEqual(allowed.violations, [])

  const violation = analyzeBackendArchitecture(
    fixture({ 'support/logging/mod.rs': 'use crate::domain::launcher::types::LauncherSettings;\n' }),
  )
  assert.deepEqual(ruleIds(violation), ['supportMustNotTouchDomain'])
})

void test('R3 treats commands.rs as the binding seam and ai/mod.rs as a seam helper', () => {
  const seam = analyzeBackendArchitecture(
    fixture({
      'domain/assets/commands.rs': 'use crate::host_runtime::HostCommand;\n#[tauri::command]\npub fn load() {}\n',
      'domain/ai/mod.rs': 'pub(crate) fn ok_ai<T>(result: anyhow::Result<T>) -> crate::host_runtime::HostCommandResult\n',
    }),
  )
  assert.deepEqual(seam.violations, [])
  assert.deepEqual(seam.legacy, [])

  const violation = analyzeBackendArchitecture(
    fixture({ 'domain/launcher/library.rs': 'use crate::host_runtime::execute;\nuse tauri::AppHandle;\n' }),
  )
  assert.deepEqual(ruleIds(violation), ['domainBusinessMustNotTouchHostRuntime', 'domainBusinessMustNotTouchHostRuntime'])
})

void test('R4 flags every nexusmods -> launcher reference now that the migration is complete', () => {
  assert.equal(NEXUSMODS_LAUNCHER_LEGACY.size, 0)

  const violation = analyzeBackendArchitecture(
    fixture({
      'domain/nexusmods/routes.rs': 'use crate::domain::launcher::types::LauncherSettings;\n',
    }),
  )
  assert.deepEqual(ruleIds(violation), ['nexusmodsMustNotTouchLauncher'])
  assert.deepEqual(violation.legacy, [])

  const strict = analyzeBackendArchitecture(
    fixture({
      'domain/nexusmods/routes.rs': 'use crate::domain::launcher::types::LauncherSettings;\n',
    }),
    { strict: true },
  )
  assert.deepEqual(ruleIds(strict), ['nexusmodsMustNotTouchLauncher'])
})

void test('R4 covers inline qualified paths, not just use statements', () => {
  const result = analyzeBackendArchitecture(
    fixture({
      'domain/nexusmods/http.rs': 'let settings = crate::domain::launcher::settings::load_launcher_settings(app)?;\n',
    }),
  )
  assert.deepEqual(ruleIds(result), ['nexusmodsMustNotTouchLauncher'])
})

void test('R5 flags business domains reading app_ui state, commands.rs seam and app_ui itself are exempt', () => {
  assert.equal(APP_UI_LEGACY.size, 0)

  const violation = analyzeBackendArchitecture(
    fixture({
      'domain/launcher/library.rs': 'use crate::domain::app_ui::load_app_ui_state;\n',
    }),
  )
  assert.deepEqual(ruleIds(violation), ['domainsMustNotTouchAppUi'])
  assert.deepEqual(violation.legacy, [])

  const legacySite = analyzeBackendArchitecture(
    fixture({
      'domain/nexusmods/diagnostics.rs': 'let result = crate::domain::app_ui::load_app_ui_state()\n',
    }),
  )
  assert.deepEqual(ruleIds(legacySite), ['domainsMustNotTouchAppUi'])

  const seam = analyzeBackendArchitecture(
    fixture({
      'domain/launcher/commands.rs': 'let force_non_premium = crate::domain::app_ui::load_app_ui_state()\n',
    }),
  )
  assert.deepEqual(seam.violations, [])

  const self = analyzeBackendArchitecture(
    fixture({
      'domain/app_ui/mod.rs': 'fn load() -> crate::domain::app_ui::AppUiState {}\n',
    }),
  )
  assert.deepEqual(self.violations, [])
})

void test('R6 restricts src root files to the registered list', () => {
  const ok = analyzeBackendArchitecture(fixture(Object.fromEntries(ROOT_FILES.map((file) => [file, '// registered\n']))))
  assert.deepEqual(ok.violations, [])

  const violation = analyzeBackendArchitecture(fixture({ 'another_runtime.rs': 'pub mod runtime;\n', 'domain/launcher/extra.rs': '' }))
  assert.deepEqual(ruleIds(violation), ['rootFileGate'])
})

void test('whitelist hooks exist and are empty after the migration batch', () => {
  assert.ok(NEXUSMODS_LAUNCHER_LEGACY instanceof Set)
  assert.ok(APP_UI_LEGACY instanceof Set)
  assert.equal(NEXUSMODS_LAUNCHER_LEGACY.size, 0)
  assert.equal(APP_UI_LEGACY.size, 0)
})

void test('the real source tree passes with the current whitelists', async () => {
  const files = await scanSourceTree()
  assert.ok(files.has('lib.rs'))
  assert.ok(files.has('domain/launcher/updates.rs'))
  const result = analyzeBackendArchitecture(files)
  assert.deepEqual(result.violations, [], JSON.stringify(result.violations, null, 2))
})
