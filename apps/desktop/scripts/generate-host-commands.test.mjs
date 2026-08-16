import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  checkHostCommandDrift,
  extractCommands,
  extractSidecarWireNames,
  extractTypedSidecarArms,
  regenerateLibRsHandler,
  regenerateSidecarDispatch,
  renderHostCommands,
  renderRustHandlerBlock,
  renderSidecarDispatchBlock,
  scanCommandFiles,
  toPascalCase,
  validateSidecarDispatch,
  validateTypedBinding,
} from './generate-host-commands.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDir, '..')

/** Same deterministic code-unit ordering the generator uses. */
const byCodeUnit = (left, right) => (left < right ? -1 : left > right ? 1 : 0)

void test('extractCommands rejects a macro attribute not followed by a snake_case pub fn', () => {
  assert.throws(
    () => extractCommands('#[host_command(io)]\npub async fn LoadAI(app: AppHandle) -> Result<(), String> { todo!() }\n', 'sample.rs'),
    /sample\.rs.*must be followed by `pub async fn <name>\(app: AppHandle, \.\.\.\)` with a snake_case name/,
  )
  assert.throws(
    () =>
      extractCommands('#[host_command(io)]\npub(crate) async fn load_ai(app: AppHandle) -> Result<(), String> { todo!() }\n', 'sample.rs'),
    /sample\.rs.*must be followed by/,
  )
  assert.throws(
    () => extractCommands('#[host_command(io)]\n// a comment in between\npub async fn load_ai(app: AppHandle) {}\n', 'sample.rs'),
    /sample\.rs.*must be followed by/,
  )
  assert.throws(
    () => extractCommands('#[tauri::command]\npub async fn NotSnake(app: AppHandle) {}\n', 'sample.rs'),
    /sample\.rs.*must be followed by/,
  )
  // Attribute mentions inside line comments are not bindings.
  const comments = '// docs: #[host_command(io)] and #[tauri::command] are the two binding forms\n'
  assert.deepEqual(extractCommands(comments), [])
})

void test('extractCommands rejects legacy State parameter wrappers', () => {
  const source = `
#[tauri::command]
pub fn sync_command(debug: tauri::State<DebugLoggingState>) {}

pub fn helper_not_a_command() {}
`
  assert.throws(() => extractCommands(source), /must use the typed binding/)
  const typed = extractCommands(`
#[tauri::command]
pub async fn scan_maps(app: AppHandle, path: String) -> Result<(), String> {
    crate::commands::runtime::execute(app, ScanMapsParams { path }).await
}
`)
  assert.deepEqual(typed[0]?.typed, { paramsType: 'ScanMapsParams', argNames: ['path'] })
})

void test('extractCommands derives typed bindings from execute calls', () => {
  const source = `
#[tauri::command]
pub async fn load_xact_audio_data_url(
    app: AppHandle,
    root_path: String,
    cue: String,
) -> Result<String, String> {
    crate::commands::runtime::execute(app, LoadXactAudioDataUrlParams { root_path, cue }).await
}

#[tauri::command]
pub async fn no_arg_command(app: AppHandle) -> Result<(), String> {
    crate::commands::runtime::execute(app, NoArgCommandParams {}).await
}
`
  const commands = extractCommands(source)
  assert.deepEqual(commands[0]?.typed, {
    paramsType: 'LoadXactAudioDataUrlParams',
    argNames: ['root_path', 'cue'],
  })
  assert.deepEqual(commands[1]?.typed, { paramsType: 'NoArgCommandParams', argNames: [] })
  assert.throws(
    () => extractCommands('#[tauri::command]\npub async fn broken(app: AppHandle, a: String) -> Result<(), String> {\n    Ok(())\n}\n'),
    /must end with runtime::execute/,
  )
})

void test('extractCommands parses host_command macro attributes', () => {
  const source = `
#[host_command(io)]
pub async fn scan_maps(app: AppHandle, root_path: String) -> Result<(), String> {
    crate::domain::assets::scan_maps(root_path)
}

#[host_command(mutation, resources(CpMakerDrafts))]
pub async fn save_cp_maker_draft(app: AppHandle, request: SaveRequest) -> Result<(), String> {
    domain::cp_maker::save_draft(request)
}
`
  const commands = extractCommands(source)
  assert.equal(commands.length, 2)
  assert.equal(commands[0]?.kind, 'macro')
  assert.deepEqual(commands[0]?.typed, { paramsType: 'ScanMapsParams', argNames: ['root_path'] })
  assert.equal(commands[1]?.kind, 'macro')
  assert.deepEqual(commands[1]?.typed, { paramsType: 'SaveCpMakerDraftParams', argNames: ['request'] })
})

void test('extractCommands mixes macro and hand-written forms', () => {
  const source = `
#[host_command(io)]
pub async fn macro_command(app: AppHandle) -> Result<(), String> {
    domain::x()
}

#[tauri::command]
pub async fn manual_command(app: AppHandle, path: String) -> Result<(), String> {
    crate::commands::runtime::execute(app, ManualCommandParams { path }).await
}
`
  const commands = extractCommands(source)
  assert.deepEqual(
    commands.map((command) => [command.wireName, command.kind]),
    [
      ['macro_command', 'macro'],
      ['manual_command', 'manual'],
    ],
  )
  assert.deepEqual(commands[1]?.typed, { paramsType: 'ManualCommandParams', argNames: ['path'] })
})

void test('toPascalCase matches the proc-macro case conversion', () => {
  // Shared vectors with the proc-macro's pascal_case_conversion test; both
  // sides must stay identical or the sidecar params type stops resolving.
  const vectors = new Map([
    ['scan_default_save_slots', 'ScanDefaultSaveSlots'],
    ['load_xact_audio_data_url', 'LoadXactAudioDataUrl'],
    ['path', 'Path'],
    ['load_2fa_codes', 'Load2faCodes'],
    ['a__b', 'AB'],
    ['x_act', 'XAct'],
  ])
  for (const [input, expected] of vectors) {
    assert.equal(toPascalCase(input), expected, input)
  }
})

void test('validateTypedBinding pins wire fields, serde defaulting and NAME', () => {
  const source = `
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadXactAudioDataUrlParams {
    pub root_path: String,
    pub cue: String,
}

impl HostCommand for LoadXactAudioDataUrlParams {
    const NAME: &'static str = "load_xact_audio_data_url";

    fn resolve() {}
}
`
  const command = {
    wireName: 'load_xact_audio_data_url',
    typed: { paramsType: 'LoadXactAudioDataUrlParams', argNames: ['root_path', 'cue'] },
  }
  assert.doesNotThrow(() => validateTypedBinding(source, command))
  assert.throws(
    () =>
      validateTypedBinding(source, {
        wireName: 'load_xact_audio_data_url',
        typed: { paramsType: 'LoadXactAudioDataUrlParams', argNames: ['root_path'] },
      }),
    /fields must equal/,
  )
  assert.throws(
    () =>
      validateTypedBinding(source, {
        wireName: 'wrong_name',
        typed: { paramsType: 'LoadXactAudioDataUrlParams', argNames: ['root_path', 'cue'] },
      }),
    /must declare const NAME/,
  )
  assert.throws(
    () => validateTypedBinding(source, { wireName: 'load_xact_audio_data_url', typed: { paramsType: 'MissingParams', argNames: [] } }),
    /missing its wire envelope struct/,
  )
  const defaulted = `
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XParams {
    pub path: String,
    #[serde(default)]
    pub locale: Option<String>,
}

impl HostCommand for XParams {
    const NAME: &'static str = "x";

    fn resolve() {}
}
`
  assert.doesNotThrow(() =>
    validateTypedBinding(defaulted, { wireName: 'x', typed: { paramsType: 'XParams', argNames: ['path', 'locale'] } }),
  )
  const missingDefault = defaulted.replace('    #[serde(default)]\n', '')
  assert.throws(
    () => validateTypedBinding(missingDefault, { wireName: 'x', typed: { paramsType: 'XParams', argNames: ['path', 'locale'] } }),
    /must carry #\[serde\(default\)\]/,
  )
  const extraDefault = defaulted.replace('    pub path: String,', '    #[serde(default)]\n    pub path: String,')
  assert.throws(
    () => validateTypedBinding(extraDefault, { wireName: 'x', typed: { paramsType: 'XParams', argNames: ['path', 'locale'] } }),
    /must not carry #\[serde\(default\)\]/,
  )
})

void test('renderHostCommands emits a stable as-const table with camelCase keys', () => {
  const rendered = renderHostCommands([
    { wireName: 'load_map_asset', tsName: 'loadMapAsset' },
    { wireName: 'scan_maps', tsName: 'scanMaps' },
  ])
  assert.match(rendered, /^\/\/ Generated by apps\/desktop\/scripts\/generate-host-commands\.mjs\. Do not edit by hand\./)
  assert.match(rendered, /  loadMapAsset: 'load_map_asset',/)
  assert.match(rendered, /} as const/)
  assert.match(rendered, /export type HostCommandName = /)
})

void test('renderRustHandlerBlock groups full paths by module with the generated header', () => {
  const rendered = renderRustHandlerBlock([
    { wireName: 'scan_maps', module: 'domain::assets::commands' },
    { wireName: 'load_map_asset', module: 'domain::assets::commands' },
    { wireName: 'list_ai_models', module: 'domain::ai::commands' },
  ])
  const lines = rendered.split('\n')
  assert.equal(lines[0], '            // Generated by apps/desktop/scripts/generate-host-commands.mjs. Do not edit by hand.')
  assert.equal(lines[1], '            // domain::ai::commands')
  assert.equal(lines[2], '            domain::ai::commands::list_ai_models,')
  assert.equal(lines[3], '            // domain::assets::commands')
  assert.equal(lines[4], '            domain::assets::commands::load_map_asset,')
  assert.equal(lines[5], '            domain::assets::commands::scan_maps,')
})

void test('extractSidecarWireNames collects dispatch arms', () => {
  const source = `
    crate::host_command_wire!(scan_maps) => io_lane(id, &command_name, move || {})
    crate::host_command_wire!(load_map_asset) => {}
`
  assert.deepEqual(extractSidecarWireNames(source), ['scan_maps', 'load_map_asset'])
})

void test('extractTypedSidecarArms accepts every rustfmt layout of the canonical pointer', () => {
  const arms = extractTypedSidecarArms(`
        crate::host_command_wire!(short_arm) => {
            resolve_typed::<crate::domain::launcher::commands::ShortArmParams>(ctx, id, args)
        }

        crate::host_command_wire!(wrapped_generics) => resolve_typed::<
            crate::domain::launcher::commands::WrappedGenericsParams,
        >(ctx, id, args),

        crate::host_command_wire!(wrapped_args) => {
            resolve_typed::<crate::support::logging::commands::WrappedArgsParams>(
                ctx, id, args,
            )
        }
`)
  assert.deepEqual(
    [...arms.entries()],
    [
      ['short_arm', { module: 'domain::launcher::commands', paramsType: 'ShortArmParams' }],
      ['wrapped_generics', { module: 'domain::launcher::commands', paramsType: 'WrappedGenericsParams' }],
      ['wrapped_args', { module: 'support::logging::commands', paramsType: 'WrappedArgsParams' }],
    ],
  )
})

void test('validateSidecarDispatch pins canonical typed arms and rejects drift', () => {
  const commands = [
    { wireName: 'export_file', module: 'domain::assets::commands', typed: { paramsType: 'ExportFileParams', argNames: [] } },
    { wireName: 'load_map_asset', module: 'domain::assets::commands', typed: { paramsType: 'LoadMapAssetParams', argNames: [] } },
    { wireName: 'scan_maps', module: 'domain::assets::commands', typed: { paramsType: 'ScanMapsParams', argNames: [] } },
  ]
  const canonicalArm = (name, paramsType) =>
    `crate::host_command_wire!(${name}) => {\n    resolve_typed::<crate::domain::assets::commands::${paramsType}>(ctx, id, args)\n}\n`
  const canonical = commands.map(({ wireName, typed }) => canonicalArm(wireName, typed.paramsType)).join('\n')
  assert.doesNotThrow(() => validateSidecarDispatch(canonical, commands))

  assert.throws(
    () => validateSidecarDispatch(canonicalArm('scan_maps', 'ScanMapsParams'), commands),
    /sidecar\.rs is missing dispatch arm\(s\) for: export_file, load_map_asset/,
  )
  assert.throws(
    () => validateSidecarDispatch(`${canonical}crate::host_command_wire!(unknown_arm) => {}\n`, commands),
    /sidecar\.rs declares unknown dispatch arm\(s\): unknown_arm/,
  )
  assert.throws(
    () =>
      validateSidecarDispatch(
        `${canonicalArm('scan_maps', 'ScanMapsParams')}crate::host_command_wire!(load_map_asset) => io_lane(id, &command_name, || {})\n`,
        commands,
      ),
    /must be the canonical resolve_typed.*load_map_asset/,
  )
  assert.throws(
    () =>
      validateSidecarDispatch(
        `${canonicalArm('scan_maps', 'ScanMapsParams')}${canonicalArm('load_map_asset', 'ScanMapsParams')}${canonicalArm('export_file', 'ExportFileParams')}`,
        commands,
      ),
    /must point at crate::domain::assets::commands::LoadMapAssetParams/,
  )
  // Arm order is part of the canonical form: a reordered arm must be rejected.
  assert.throws(
    () =>
      validateSidecarDispatch(
        `${canonicalArm('scan_maps', 'ScanMapsParams')}${canonicalArm('export_file', 'ExportFileParams')}${canonicalArm('load_map_asset', 'LoadMapAssetParams')}`,
        commands,
      ),
    /sidecar\.rs dispatch arm order drifted/,
  )
})

void test('regenerateLibRsHandler replaces only the invoke handler block', () => {
  const libRs = `pub fn run() {
    builder
        .invoke_handler(tauri::generate_handler![
            legacy_command,
        ])
        .build()
}
`
  const next = regenerateLibRsHandler(libRs, [
    { wireName: 'scan_maps', module: 'domain::assets::commands' },
    { wireName: 'export_file', module: 'domain::assets::commands' },
  ])
  assert.equal(
    next,
    `pub fn run() {
    builder
        .invoke_handler(tauri::generate_handler![
            // Generated by apps/desktop/scripts/generate-host-commands.mjs. Do not edit by hand.
            // domain::assets::commands
            domain::assets::commands::export_file,
            domain::assets::commands::scan_maps,
        ])
        .build()
}
`,
  )
  assert.throws(
    () => regenerateLibRsHandler('pub fn run() {}', []),
    /does not contain a \.invoke_handler\(tauri::generate_handler!\[\.\.\.\]\) block/,
  )
})

void test('renderSidecarDispatchBlock groups canonical type pointers by module', () => {
  const rendered = renderSidecarDispatchBlock([
    { wireName: 'scan_maps', module: 'domain::assets::commands', typed: { paramsType: 'ScanMapsParams', argNames: [] } },
    { wireName: 'load_map_asset', module: 'domain::assets::commands', typed: { paramsType: 'LoadMapAssetParams', argNames: [] } },
    { wireName: 'list_ai_models', module: 'domain::ai::commands', typed: { paramsType: 'ListAiModelsParams', argNames: [] } },
  ])
  const lines = rendered.split('\n')
  assert.equal(lines[0], '        // Generated by apps/desktop/scripts/generate-host-commands.mjs. Do not edit by hand.')
  assert.equal(lines[1], '        // domain::ai::commands')
  assert.match(lines[2], /host_command_wire!\(list_ai_models\) => resolve_typed::</)
  assert.equal(lines[3], '            crate::domain::ai::commands::ListAiModelsParams,')
  assert.equal(lines[5], '        // domain::assets::commands')
  assert.match(lines[6], /host_command_wire!\(load_map_asset\) => resolve_typed::</)
  assert.equal(lines[7], '            crate::domain::assets::commands::LoadMapAssetParams,')
  assert.equal(lines[10], '            crate::domain::assets::commands::ScanMapsParams,')
})

void test('regenerating the real lib.rs handler block is idempotent and sidecar dispatch stays in sync', async () => {
  const srcTauriDir = path.join(desktopRoot, 'src-tauri/src')
  const commands = await scanCommandFiles(srcTauriDir)
  const libRs = await readFile(path.join(srcTauriDir, 'lib.rs'), 'utf8')
  const sidecar = await readFile(path.join(srcTauriDir, 'host/sidecar.rs'), 'utf8')

  assert.equal(regenerateLibRsHandler(libRs, commands), libRs, 'lib.rs handler block drifted from the generator output')
  assert.doesNotThrow(() => validateSidecarDispatch(sidecar, commands), 'sidecar.rs dispatch arms drifted from #[tauri::command] functions')
  // rustfmt may rewrap the generated arms, so drift is detected semantically:
  // the arm set (name -> module::ParamsType) and the sorted arm order.
  const expectedArms = new Map(
    commands.map((command) => [command.wireName, { module: command.module, paramsType: command.typed.paramsType }]),
  )
  const orderedModules = [...new Set(commands.map((command) => command.module))].sort(byCodeUnit)
  const expectedModuleOrder = orderedModules.flatMap((module) =>
    commands
      .filter((command) => command.module === module)
      .map((command) => command.wireName)
      .sort(byCodeUnit),
  )
  assert.deepEqual(extractTypedSidecarArms(sidecar), expectedArms, 'sidecar.rs typed arm set drifted from the generator output')
  assert.deepEqual(extractSidecarWireNames(sidecar), expectedModuleOrder, 'sidecar.rs arm order drifted from the generator output')
  assert.deepEqual(
    extractTypedSidecarArms(regenerateSidecarDispatch(sidecar, commands)),
    expectedArms,
    'sidecar dispatch renderer drifted from the scanned commands',
  )
  assert.deepEqual(extractSidecarWireNames(regenerateSidecarDispatch(sidecar, commands)), expectedModuleOrder)
})

void test('scanCommandFiles walks the src tree for commands.rs files and tags module paths', async () => {
  const srcTauriDir = path.join(desktopRoot, 'src-tauri/src')
  const commandFiles = []
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'tests') {
          await walk(fullPath)
        }
      } else if (entry.name === 'commands.rs') {
        commandFiles.push(fullPath)
      }
    }
  }
  await walk(srcTauriDir)
  commandFiles.sort(byCodeUnit)
  const expected = []
  for (const filePath of commandFiles) {
    const source = await readFile(filePath, 'utf8')
    const modulePath = filePath
      .slice(srcTauriDir.length + 1)
      .replaceAll('\\', '/')
      .replace(/\.rs$/, '')
      .replaceAll('/', '::')
    for (const command of extractCommands(source)) {
      expected.push({ ...command, module: modulePath })
    }
  }
  const commands = await scanCommandFiles(srcTauriDir)
  assert.equal(commands.length, expected.length)
  assert.deepEqual(commands, expected)
})

void test('scanCommandFiles rejects duplicate command names', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gen-host-commands-'))
  try {
    const typedCommand = `
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateCmdParams {
    pub path: String,
}

impl HostCommand for DuplicateCmdParams {
    const NAME: &'static str = "duplicate_cmd";

    fn resolve() -> ResolvedCommandOrResponse {
        todo!()
    }
}

#[tauri::command]
pub async fn duplicate_cmd(app: AppHandle, path: String) -> Result<(), String> {
    crate::host_runtime::execute(app, DuplicateCmdParams { path }).await
}
`
    await mkdir(path.join(root, 'a'), { recursive: true })
    await mkdir(path.join(root, 'b'), { recursive: true })
    await writeFile(path.join(root, 'a', 'commands.rs'), typedCommand)
    await writeFile(path.join(root, 'b', 'commands.rs'), typedCommand)
    await assert.rejects(scanCommandFiles(root), /Duplicate host command function name: duplicate_cmd/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

void test('scanCommandFiles skips tests directories', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gen-host-commands-'))
  try {
    await mkdir(path.join(root, 'domain', 'assets'), { recursive: true })
    await mkdir(path.join(root, 'tests', 'unit', 'fixtures'), { recursive: true })
    const realBinding = `#[host_command(io)]\npub async fn scan_maps(app: AppHandle) -> Result<(), String> { todo!() }\n`
    await writeFile(path.join(root, 'domain', 'assets', 'commands.rs'), realBinding)
    // A test helper named commands.rs would derive a non-existent module path.
    await writeFile(path.join(root, 'tests', 'unit', 'fixtures', 'commands.rs'), realBinding)
    const commands = await scanCommandFiles(root)
    assert.deepEqual(
      commands.map((command) => ({ name: command.wireName, module: command.module })),
      [{ name: 'scan_maps', module: 'domain::assets::commands' }],
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

void test('scanCommandFiles rejects HOST_COMMANDS key collisions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gen-host-commands-'))
  try {
    const bindings = `#[host_command(io)]\npub async fn foo_1(app: AppHandle) -> Result<(), String> { todo!() }\n
#[host_command(io)]\npub async fn foo1(app: AppHandle) -> Result<(), String> { todo!() }\n`
    await writeFile(path.join(root, 'commands.rs'), bindings)
    await assert.rejects(scanCommandFiles(root), /HOST_COMMANDS key collision: 'foo1'/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

void test('scanCommandFiles rejects an empty src tree', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gen-host-commands-'))
  try {
    await assert.rejects(scanCommandFiles(root), /No host commands found/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

void test('checkHostCommandDrift reports no problems for the real tree', async () => {
  const problems = await checkHostCommandDrift()
  assert.deepEqual(problems, [])
})
