use super::{
    GMCM_PROBE_OUTPUT_LIMIT, ProbeAttempt, ProbePayload, gmcm_parsing_enabled_at_path,
    launcher_probe_status, load_launcher_mod_config, merge_probe_payload_fields,
    merged_probe_diagnostics, probe_gmcm_detected, resolve_dotnet_host_path,
    run_probe_with_timeout, save_launcher_mod_config,
};
use crate::domain::launcher::types::{
    LauncherModConfigFieldType, LauncherModConfigProbeStatus, LauncherModConfigResult,
    LauncherModConfigSource, LauncherModConfigUiHint, LoadLauncherModConfigRequest,
    SaveLauncherModConfigRequest,
};
use crate::test_support::{create_temp_dir, write_file};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

// Fallback-heavy fixtures need extra cold-start budget under parallel Windows test load.
const GMCM_REGRESSION_PROBE_TIMEOUT_MS: &str = "30000";

fn write_manifest(root: &std::path::Path, config_schema: &str) {
    write_file(
        &root.join("manifest.json"),
        &format!(
            r#"{{
  "Name": "Config Test",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "ModForge.ConfigTest",
  "ConfigSchema": {config_schema}
}}"#
        ),
    );
}

#[test]
fn gmcm_probe_preference_disables_dynamic_parsing() {
    let root = create_temp_dir("gmcm-parsing-preference");
    let settings_path = root.join("settings.json");
    write_file(&settings_path, r#"{"gmcmParsingEnabled":false}"#);

    assert!(!gmcm_parsing_enabled_at_path(&settings_path));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn probe_payload_rejects_path_shaped_config_keys() {
    let payload = ProbePayload {
        result: json!({
            "fields": [{
                "key": "config./home/example/.local/share/Steam/Mods/DynamicShader/config.json",
                "label": "config./home/example/.local/share/Steam/Mods/DynamicShader/config.json",
                "source": "generic-mod-config-menu",
                "type": "string"
            }]
        })
        .as_object()
        .expect("probe payload")
        .clone(),
        duration_ms: 1,
        stderr: None,
        process_succeeded: true,
    };
    let mut fields = Vec::new();

    merge_probe_payload_fields(&payload, &serde_json::Map::new(), &mut fields, true);

    assert!(fields.is_empty());
}

#[test]
fn dotnet_host_resolves_user_install_when_path_does_not_include_dotnet() {
    let root = create_temp_dir("dotnet-user-install");
    let home = root.join("home");
    let dotnet = home.join(".dotnet").join(if cfg!(windows) {
        "dotnet.exe"
    } else {
        "dotnet"
    });
    write_file(&dotnet, "host");

    let resolved = resolve_dotnet_host_path(
        None,
        Some(root.join("empty-bin").into_os_string()),
        Some(home),
    );

    assert_eq!(resolved, dotnet);
    fs::remove_dir_all(root).expect("cleanup");
}

fn write_gmcm_manifest(root: &Path, config_schema: &str) {
    write_file(
        &root.join("manifest.json"),
        &format!(
            r#"{{
  "Name": "Config Test",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "ModForge.ConfigTest",
  "EntryDll": "FakeGmcmMod.dll",
  "ConfigSchema": {config_schema}
}}"#,
        ),
    );
}

fn env_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .expect("repo root")
        .to_path_buf()
}

fn build_gmcm_probe() -> PathBuf {
    static PROBE_ASSEMBLY: OnceLock<PathBuf> = OnceLock::new();
    PROBE_ASSEMBLY
        .get_or_init(|| {
            let root = repo_root();
            let output = Command::new("dotnet")
                .arg("build")
                .arg(root.join("apps/desktop/tools/gmcm-probe/GmcmProbe.csproj"))
                .arg("--configuration")
                .arg("Release")
                .arg("--nologo")
                .output()
                .expect("start GMCM probe build");
            assert!(
                output.status.success(),
                "GMCM probe build failed.\nstdout:\n{}\nstderr:\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );

            let probe_assembly = root
                .join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0")
                .join("modforge-gmcm-probe.dll");
            assert!(
                probe_assembly.is_file(),
                "GMCM probe build did not produce {}",
                probe_assembly.display()
            );
            probe_assembly
        })
        .clone()
}

fn build_fake_noisy_probe(root: &Path) -> Option<PathBuf> {
    write_file(
        &root.join("FakeNoisyProbe.csproj"),
        r#"<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net6.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>FakeNoisyProbe</AssemblyName>
    <UseAppHost>false</UseAppHost>
  </PropertyGroup>
</Project>"#,
    );
    write_file(
        &root.join("Program.cs"),
        r#"
var timeoutIndex = Array.IndexOf(args, "--timeout-ms");
var childTimeout = timeoutIndex >= 0 && timeoutIndex + 1 < args.Length ? args[timeoutIndex + 1] : "missing";
var modPathIndex = Array.IndexOf(args, "--mod-path");
var modPath = modPathIndex >= 0 && modPathIndex + 1 < args.Length ? args[modPathIndex + 1] : throw new InvalidOperationException("missing --mod-path");
File.WriteAllText(Path.Combine(modPath, "noisy-probe-cwd.txt"), Environment.CurrentDirectory);
Console.Error.Write(new string('x', 5 * 1024 * 1024));
await Task.Delay(Timeout.Infinite);
"#,
    );
    let output = Command::new("dotnet")
        .arg("build")
        .arg(root.join("FakeNoisyProbe.csproj"))
        .arg("--configuration")
        .arg("Release")
        .arg("--nologo")
        .output()
        .ok()?;
    if !output.status.success() {
        eprintln!(
            "Fake noisy probe build failed.\nstdout:\n{}\nstderr:\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        return None;
    }
    let probe = root.join("bin/Release/net6.0/FakeNoisyProbe.dll");
    probe.is_file().then_some(probe)
}

fn build_fake_descendant_probe(root: &Path) -> Option<PathBuf> {
    write_file(
        &root.join("FakeDescendantProbe.csproj"),
        r#"<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net6.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>FakeDescendantProbe</AssemblyName>
    <UseAppHost>false</UseAppHost>
  </PropertyGroup>
</Project>"#,
    );
    write_file(
        &root.join("Program.cs"),
        r#"
using System.Diagnostics;

if (args.Length >= 2 && args[0] == "--child")
{
    File.WriteAllText(args[1], Environment.ProcessId.ToString());
    await Task.Delay(750);
    File.WriteAllText(args[2], "survived");
    await Task.Delay(Timeout.Infinite);
    return;
}

var modPathIndex = Array.IndexOf(args, "--mod-path");
var modPath = modPathIndex >= 0 && modPathIndex + 1 < args.Length
    ? args[modPathIndex + 1]
    : throw new InvalidOperationException("missing --mod-path");
var childStartedPath = Path.Combine(modPath, "descendant-started.txt");
var childSurvivedPath = Path.Combine(modPath, "descendant-survived.txt");
File.WriteAllText(Path.Combine(modPath, "probe-cwd.txt"), Environment.CurrentDirectory);

using var child = Process.Start(new ProcessStartInfo
{
    FileName = "dotnet",
    UseShellExecute = false,
    CreateNoWindow = true,
    ArgumentList =
    {
        typeof(Program).Assembly.Location,
        "--child",
        childStartedPath,
        childSurvivedPath,
    },
}) ?? throw new InvalidOperationException("failed to start descendant");

var startedDeadline = DateTime.UtcNow.AddSeconds(2);
while (!File.Exists(childStartedPath) && DateTime.UtcNow < startedDeadline)
    await Task.Delay(10);
if (!File.Exists(childStartedPath))
    throw new TimeoutException("descendant did not start");

Console.Write("{\"probeStatus\":\"not-run\",\"fields\":[]}");
"#,
    );
    let output = Command::new("dotnet")
        .arg("build")
        .arg(root.join("FakeDescendantProbe.csproj"))
        .arg("--configuration")
        .arg("Release")
        .arg("--nologo")
        .output()
        .ok()?;
    if !output.status.success() {
        eprintln!(
            "Fake descendant probe build failed.\nstdout:\n{}\nstderr:\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        return None;
    }
    let probe = root.join("bin/Release/net6.0/FakeDescendantProbe.dll");
    probe.is_file().then_some(probe)
}

fn build_fake_gmcm_mod(root: &Path) -> bool {
    let probe_output_dir = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let smapi_assembly = probe_output_dir.join("StardewModdingAPI.dll");
    let core_interfaces_assembly = probe_output_dir.join("SMAPI.Toolkit.CoreInterfaces.dll");
    build_fake_gmcm_mod_with_options(root, &smapi_assembly, &core_interfaces_assembly, "", "", "")
}

fn build_fake_harmony_gmcm_mod(root: &Path) -> bool {
    let probe_output_dir = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let smapi_assembly = probe_output_dir.join("StardewModdingAPI.dll");
    let core_interfaces_assembly = probe_output_dir.join("SMAPI.Toolkit.CoreInterfaces.dll");
    let harmony_assembly = probe_output_dir.join("0Harmony.dll");
    build_fake_gmcm_mod_with_options(
        root,
        &smapi_assembly,
        &core_interfaces_assembly,
        &format!(
            r#"
    <Reference Include="0Harmony">
      <HintPath>{}</HintPath>
      <Private>false</Private>
    </Reference>"#,
            harmony_assembly.display()
        ),
        "using HarmonyLib;\n",
        r#"        var harmony = new Harmony("modforge.fake.gmcm");
        harmony.PatchAll();
        var method = AccessTools.DeclaredMethod(typeof(FakeGmcmMod), nameof(Entry), new[] { typeof(IModHelper) });
        _ = AccessTools.Constructor(typeof(ModConfig), Type.EmptyTypes, false);
        _ = AccessTools.DeclaredConstructor(typeof(ModConfig), Type.EmptyTypes, false);
        _ = AccessTools.GetDeclaredMethods(typeof(FakeGmcmMod));
        _ = AccessTools.IsDeclaredMember(method);
        _ = new HarmonyMethod(method!, 0, Array.Empty<string>(), Array.Empty<string>(), false);
"#,
    )
}

fn build_fake_gmcm_mod_with_options(
    root: &Path,
    smapi_assembly: &Path,
    core_interfaces_assembly: &Path,
    extra_reference: &str,
    extra_using: &str,
    entry_prelude: &str,
) -> bool {
    write_file(
        &root.join("FakeGmcmMod.csproj"),
        &format!(
            r#"<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>FakeGmcmMod</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="StardewModdingAPI">
      <HintPath>{}</HintPath>
      <Private>false</Private>
    </Reference>
    <Reference Include="SMAPI.Toolkit.CoreInterfaces">
      <HintPath>{}</HintPath>
      <Private>false</Private>
    </Reference>
    {extra_reference}
  </ItemGroup>
</Project>"#,
            smapi_assembly.display(),
            core_interfaces_assembly.display()
        ),
    );
    let source = root.join("FakeGmcmMod.cs");
    write_file(
        &source,
        &[
            r#"
using System;
using StardewModdingAPI;
"#,
            extra_using,
            r#"

public sealed class FakeGmcmMod : Mod
{
    private ModConfig Config = new();

    public override void Entry(IModHelper helper)
    {
"#,
            entry_prelude,
            r#"
        Config = helper.ReadConfig<ModConfig>();
        helper.Events.GameLoop.GameLaunched += (_, _) =>
        {
            var api = helper.ModRegistry.GetApi<IGenericModConfigMenuApi>("spacechase0.GenericModConfigMenu");
            if (api == null) return;
            api.Register(ModManifest, () => Config = new ModConfig(), () => helper.WriteConfig(Config));
            api.AddSectionTitle(ModManifest, () => "General");
            api.AddBoolOption(ModManifest, () => Config.Enabled, value => Config.Enabled = value, () => helper.Translation.Get("Enabled"), () => "Toggles the feature.", "Enabled");
            api.AddTextOption(ModManifest, () => Config.Mode, value => Config.Mode = value, () => "Mode", () => "Pick a mode.", new[] { "Balanced", "Fast" }, "Mode");
            api.AddKeybind(ModManifest, () => Config.OpenMenuKey, value => Config.OpenMenuKey = value, () => "Open menu key", () => "Opens the menu.", "OpenMenuKey");
        };
    }
}

public sealed class ModConfig
{
    public bool Enabled { get; set; } = true;
    public string Mode { get; set; } = "Balanced";
    public string OpenMenuKey { get; set; } = "P";
}

public interface IGenericModConfigMenuApi
{
    void Register(IManifest mod, Action reset, Action save);
    void AddSectionTitle(IManifest mod, Func<string> text);
    void AddBoolOption(IManifest mod, Func<bool> getValue, Action<bool> setValue, Func<string> name, Func<string> tooltip, string fieldId);
    void AddTextOption(IManifest mod, Func<string> getValue, Action<string> setValue, Func<string> name, Func<string> tooltip, string[] allowedValues, string fieldId);
    void AddKeybind(IManifest mod, Func<string> getValue, Action<string> setValue, Func<string> name, Func<string> tooltip, string fieldId);
}
"#,
        ]
        .concat(),
    );
    let output = Command::new("dotnet")
        .arg("build")
        .arg(root.join("FakeGmcmMod.csproj"))
        .arg("--configuration")
        .arg("Release")
        .arg("--nologo")
        .output();
    if !matches!(&output, Ok(output) if output.status.success()) {
        if let Ok(output) = &output {
            eprintln!(
                "Fake GMCM mod build failed.\nstdout:\n{}\nstderr:\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
        }
        return false;
    }
    fs::copy(
        root.join("bin/Release/net6.0/FakeGmcmMod.dll"),
        root.join("FakeGmcmMod.dll"),
    )
    .is_ok()
}

fn build_fake_direct_registration_mod(root: &Path) -> bool {
    let probe_output_dir = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let smapi_assembly = probe_output_dir.join("StardewModdingAPI.dll");
    let core_interfaces_assembly = probe_output_dir.join("SMAPI.Toolkit.CoreInterfaces.dll");
    write_file(
        &root.join("FakeDirectGmcmMod.csproj"),
        &format!(
            r#"<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>FakeDirectGmcmMod</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="StardewModdingAPI">
      <HintPath>{}</HintPath>
      <Private>false</Private>
    </Reference>
    <Reference Include="SMAPI.Toolkit.CoreInterfaces">
      <HintPath>{}</HintPath>
      <Private>false</Private>
    </Reference>
  </ItemGroup>
</Project>"#,
            smapi_assembly.display(),
            core_interfaces_assembly.display()
        ),
    );
    write_file(
        &root.join("FakeDirectGmcmMod.cs"),
        r#"
using System;
using System.IO;
using StardewModdingAPI;

public sealed class FakeDirectGmcmMod : Mod
{
    private ModConfig Config { get; set; } = new();

    public FakeDirectGmcmMod()
    {
        throw new FileNotFoundException("Missing private runtime dependency.", "Missing.Runtime.Dependency");
    }

    public override void Entry(IModHelper helper)
    {
        Config = helper.ReadConfig<ModConfig>();
        helper.Events.GameLoop.GameLaunched += (_, _) =>
        {
            var api = helper.ModRegistry.GetApi<IGenericModConfigMenuApi>("spacechase0.GenericModConfigMenu");
            if (api != null) SetupConfigMenu(api);
        };
    }

    private void SetupConfigMenu(IGenericModConfigMenuApi api)
    {
        api.Register(ModManifest, () => Config = new ModConfig(), () => Helper.WriteConfig(Config));
        api.AddBoolOption(ModManifest, () => Config.Enabled, value => Config.Enabled = value, () => "Enabled", () => "Toggles the feature.", "Enabled");
    }
}

public sealed class ModConfig
{
    public bool Enabled { get; set; } = true;
}

public interface IGenericModConfigMenuApi
{
    void Register(IManifest mod, Action reset, Action save);
    void AddBoolOption(IManifest mod, Func<bool> getValue, Action<bool> setValue, Func<string> name, Func<string> tooltip, string fieldId);
}
"#,
    );
    let output = Command::new("dotnet")
        .arg("build")
        .arg(root.join("FakeDirectGmcmMod.csproj"))
        .arg("--configuration")
        .arg("Release")
        .arg("--nologo")
        .output();
    if !matches!(&output, Ok(output) if output.status.success()) {
        if let Ok(output) = &output {
            eprintln!(
                "Fake direct GMCM mod build failed.\nstdout:\n{}\nstderr:\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
        }
        return false;
    }
    fs::copy(
        root.join("bin/Release/net6.0/FakeDirectGmcmMod.dll"),
        root.join("FakeDirectGmcmMod.dll"),
    )
    .is_ok()
}

fn build_fake_static_registration_mod(root: &Path) -> bool {
    let probe_output_dir = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let smapi_assembly = probe_output_dir.join("StardewModdingAPI.dll");
    let core_interfaces_assembly = probe_output_dir.join("SMAPI.Toolkit.CoreInterfaces.dll");
    write_file(
        &root.join("FakeStaticGmcmMod.csproj"),
        &format!(
            r#"<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>FakeStaticGmcmMod</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="StardewModdingAPI">
      <HintPath>{}</HintPath>
      <Private>false</Private>
    </Reference>
    <Reference Include="SMAPI.Toolkit.CoreInterfaces">
      <HintPath>{}</HintPath>
      <Private>false</Private>
    </Reference>
  </ItemGroup>
</Project>"#,
            smapi_assembly.display(),
            core_interfaces_assembly.display()
        ),
    );
    write_file(
        &root.join("FakeStaticGmcmMod.cs"),
        r#"
using System;
using System.IO;
using StardewModdingAPI;

public sealed class FakeStaticGmcmMod : Mod
{
    public FakeStaticGmcmMod()
    {
        throw new FileNotFoundException("Missing private runtime dependency.", "Missing.Runtime.Dependency");
    }

    public override void Entry(IModHelper helper)
    {
        helper.Events.GameLoop.GameLaunched += (_, _) => StaticConfigMenu.Setup(new ModConfig(), this);
    }
}

public static class StaticConfigMenu
{
    public static void Setup(ModConfig config, FakeStaticGmcmMod mod)
    {
        var api = mod.Helper.ModRegistry.GetApi<IGenericModConfigMenuApi>("spacechase0.GenericModConfigMenu");
        if (api == null) return;
        api.Register(mod.ModManifest, () => config = new ModConfig(), () => mod.Helper.WriteConfig(config));
        api.AddBoolOption(mod.ModManifest, () => config.Enabled, value => config.Enabled = value, () => "Enabled", () => "Toggles the feature.", "Enabled");
    }
}

public sealed class ModConfig
{
    public bool Enabled { get; set; } = true;
}

public interface IGenericModConfigMenuApi
{
    void Register(IManifest mod, Action reset, Action save);
    void AddBoolOption(IManifest mod, Func<bool> getValue, Action<bool> setValue, Func<string> name, Func<string> tooltip, string fieldId);
}
"#,
    );
    let output = Command::new("dotnet")
        .arg("build")
        .arg(root.join("FakeStaticGmcmMod.csproj"))
        .arg("--configuration")
        .arg("Release")
        .arg("--nologo")
        .output();
    if !matches!(&output, Ok(output) if output.status.success()) {
        if let Ok(output) = &output {
            eprintln!(
                "Fake static GMCM mod build failed.\nstdout:\n{}\nstderr:\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
        }
        return false;
    }
    fs::copy(
        root.join("bin/Release/net6.0/FakeStaticGmcmMod.dll"),
        root.join("FakeStaticGmcmMod.dll"),
    )
    .is_ok()
}

fn build_fake_static_config_mod(root: &Path) -> bool {
    write_file(
        &root.join("FakeStaticConfigMod.csproj"),
        r#"<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>FakeStaticConfigMod</AssemblyName>
  </PropertyGroup>
</Project>"#,
    );
    write_file(
        &root.join("FakeStaticConfigMod.cs"),
        r#"
public sealed class FakeStaticConfigMod
{
    public ModConfig Config { get; } = new();
}

public sealed class ModConfig
{
    public bool Enabled { get; set; } = true;
    public string Mode { get; set; } = "Default";
}
"#,
    );
    let output = Command::new("dotnet")
        .arg("build")
        .arg(root.join("FakeStaticConfigMod.csproj"))
        .arg("--configuration")
        .arg("Release")
        .arg("--nologo")
        .output();
    if !matches!(&output, Ok(output) if output.status.success()) {
        if let Ok(output) = &output {
            eprintln!(
                "Fake static config mod build failed.\nstdout:\n{}\nstderr:\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
        }
        return false;
    }
    fs::copy(
        root.join("bin/Release/net6.0/FakeStaticConfigMod.dll"),
        root.join("FakeStaticConfigMod.dll"),
    )
    .is_ok()
}

fn write_gmcm_fixture_manifest(root: &Path, assembly_name: &str) {
    let manifest = json!({
        "Name": "GMCM Probe Regression Fixture",
        "Author": "ModForge",
        "Version": "1.0.0",
        "UniqueID": format!("ModForge.{assembly_name}"),
        "EntryDll": format!("{assembly_name}.dll"),
    });
    write_file(
        &root.join("manifest.json"),
        &serde_json::to_string_pretty(&manifest).expect("serialize fixture manifest"),
    );
}

fn build_fake_gmcm_fixture(root: &Path, assembly_name: &str, source: &str) -> bool {
    build_fake_gmcm_fixture_with_project_items(root, assembly_name, source, "")
}

fn build_fake_gmcm_fixture_with_newtonsoft(root: &Path, assembly_name: &str, source: &str) -> bool {
    if !build_fake_gmcm_fixture_with_project_items(
        root,
        assembly_name,
        source,
        r#"<PackageReference Include="Newtonsoft.Json" Version="13.0.3" />"#,
    ) {
        return false;
    }

    fs::copy(
        root.join("bin/Release/net6.0/Newtonsoft.Json.dll"),
        root.join("Newtonsoft.Json.dll"),
    )
    .is_ok()
}

fn build_fake_gmcm_fixture_with_project_items(
    root: &Path,
    assembly_name: &str,
    source: &str,
    project_items: &str,
) -> bool {
    let probe_output_dir = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let smapi_assembly = probe_output_dir.join("StardewModdingAPI.dll");
    let core_interfaces_assembly = probe_output_dir.join("SMAPI.Toolkit.CoreInterfaces.dll");
    write_file(
        &root.join("Fixture.csproj"),
        &format!(
            r#"<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>{assembly_name}</AssemblyName>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <CopyLocalLockFileAssemblies>true</CopyLocalLockFileAssemblies>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="Fixture.cs" />
    <Reference Include="StardewModdingAPI">
      <HintPath>{}</HintPath>
      <Private>false</Private>
    </Reference>
    <Reference Include="SMAPI.Toolkit.CoreInterfaces">
      <HintPath>{}</HintPath>
      <Private>false</Private>
    </Reference>
    {project_items}
  </ItemGroup>
</Project>"#,
            smapi_assembly.display(),
            core_interfaces_assembly.display()
        ),
    );
    write_file(&root.join("Fixture.cs"), source);

    let output = Command::new("dotnet")
        .arg("build")
        .arg(root.join("Fixture.csproj"))
        .arg("--configuration")
        .arg("Release")
        .arg("--nologo")
        .output();
    if !matches!(&output, Ok(output) if output.status.success()) {
        if let Ok(output) = &output {
            eprintln!(
                "Fake GMCM regression fixture build failed.\nstdout:\n{}\nstderr:\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
        }
        return false;
    }

    fs::copy(
        root.join(format!("bin/Release/net6.0/{assembly_name}.dll")),
        root.join(format!("{assembly_name}.dll")),
    )
    .is_ok()
}

fn run_gmcm_runtime_probe(probe_path: &Path, root: &Path) -> Value {
    let game_path = probe_path.parent().expect("probe output directory");
    let output = Command::new("dotnet")
        .arg(probe_path)
        .arg("--mode")
        .arg("runtime")
        .arg("--mod-path")
        .arg(root)
        .arg("--game-path")
        .arg(game_path)
        .arg("--timeout-ms")
        .arg(GMCM_REGRESSION_PROBE_TIMEOUT_MS)
        .output()
        .expect("run GMCM regression probe");
    assert!(
        output.status.success(),
        "probe failed: status={:?}\nstdout:\n{}\nstderr:\n{}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap_or_else(|error| {
        panic!(
            "probe should return JSON ({error}): {}",
            String::from_utf8_lossy(&output.stdout)
        )
    })
}

fn load_gmcm_fixture(
    probe_path: &Path,
    mods_root: &Path,
    mod_root: &Path,
) -> LauncherModConfigResult {
    let _environment = ProbeEnvironment::install(
        probe_path,
        probe_path.parent().expect("probe output directory"),
        mods_root,
    );
    load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: mod_root.to_string_lossy().into_owned(),
        locale: None,
    })
    .expect("load GMCM regression fixture")
}

struct ProbeEnvironment {
    previous: [(&'static str, Option<std::ffi::OsString>); 3],
}

impl ProbeEnvironment {
    fn install(probe_path: &Path, game_path: &Path, mods_root: &Path) -> Self {
        let keys = [
            "MODFORGE_GMCM_PROBE_PATH",
            "MODFORGE_GMCM_PROBE_GAME_PATH",
            "MODFORGE_GMCM_PROBE_MODS_PATH",
        ];
        let previous = keys.map(|key| (key, std::env::var_os(key)));
        // SAFETY: callers serialize access to process environment mutation with env_lock.
        unsafe {
            std::env::set_var(keys[0], probe_path);
            std::env::set_var(keys[1], game_path);
            std::env::set_var(keys[2], mods_root);
        }
        Self { previous }
    }
}

impl Drop for ProbeEnvironment {
    fn drop(&mut self) {
        // SAFETY: callers retain env_lock until after this guard is dropped.
        unsafe {
            for (key, value) in &self.previous {
                if let Some(value) = value {
                    std::env::set_var(key, value);
                } else {
                    std::env::remove_var(key);
                }
            }
        }
    }
}

#[test]
fn gmcm_probe_uses_storage_member_key_and_models_external_api_availability() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let game_root = create_temp_dir("launcher-mod-config-storage-key-game");
    let mods_root = game_root.join("Mods");
    let root = mods_root.join("StorageKeyFixture");
    fs::create_dir_all(&root).expect("create storage-key fixture root");
    write_gmcm_fixture_manifest(&root, "StorageKeyFixture");
    write_file(&root.join("config.json"), r#"{ "ActualSetting": false }"#);
    assert!(
        build_fake_gmcm_fixture(
            &root,
            "StorageKeyFixture",
            r#"
using System;
using StardewModdingAPI;

public sealed class FixtureMod : Mod
{
    private ModConfig Config = new();

    public override void Entry(IModHelper helper)
    {
        Config = helper.ReadConfig<ModConfig>();
        if (Config.ActualSetting)
        {
            throw new InvalidOperationException("System.Text.Json must populate public config fields.");
        }
        helper.Events.GameLoop.GameLaunched += (_, _) =>
        {
            if (helper.ModRegistry.IsLoaded("ModForge.UnknownApi")
                || helper.ModRegistry.GetApi<IUnknownApi>("ModForge.UnknownApi") is not null)
            {
                throw new InvalidOperationException("Unknown external APIs must stay unavailable.");
            }
            if (!helper.ModRegistry.IsLoaded("Pathoschild.ContentPatcher")
                || helper.ModRegistry.GetApi<IContentPatcherApi>("Pathoschild.ContentPatcher") is null)
            {
                throw new InvalidOperationException("The Content Patcher API profile must be available.");
            }

            var api = helper.ModRegistry.GetApi<IGenericModConfigMenuApi>("spacechase0.GenericModConfigMenu");
            if (api == null) return;
            api.Register(ModManifest, () => Config = new ModConfig(), () => helper.WriteConfig(Config));
            api.AddBoolOption(
                ModManifest,
                () => Config.ActualSetting,
                value => Config.ActualSetting = value,
                () => "Actual setting",
                () => "Backed by ActualSetting.",
                "ui-toggle");
        };
    }
}

public sealed class ModConfig
{
    public bool ActualSetting = true;
}

public interface IUnknownApi { }
public interface IContentPatcherApi { }

public interface IGenericModConfigMenuApi
{
    void Register(IManifest mod, Action reset, Action save);
    void AddBoolOption(IManifest mod, Func<bool> getValue, Action<bool> setValue, Func<string> name, Func<string> tooltip, string fieldId);
}
"#,
        ),
        "storage-key fixture should build"
    );

    let result = load_gmcm_fixture(&probe_path, &mods_root, &root);

    assert_eq!(result.probe_status, LauncherModConfigProbeStatus::Succeeded);
    let field = result
        .fields
        .iter()
        .find(|field| field.key == "ActualSetting")
        .expect("storage member field");
    assert_eq!(field.source, LauncherModConfigSource::GenericModConfigMenu);
    assert_eq!(field.value, json!(false));
    assert_eq!(field.default_value, Some(json!(true)));
    assert!(result.fields.iter().all(|field| field.key != "ui-toggle"));

    let assembly_warnings = result
        .probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("assemblyLoadWarnings"))
        .and_then(Value::as_array)
        .expect("assembly load diagnostics");
    assert!(
        assembly_warnings
            .iter()
            .filter_map(Value::as_str)
            .any(|warning| {
                warning.contains("ModForge.UnknownApi") && warning.contains("unavailable")
            })
    );
    assert!(
        assembly_warnings
            .iter()
            .filter_map(Value::as_str)
            .any(|warning| {
                warning.contains("Pathoschild.ContentPatcher") && warning.contains("simulated")
            })
    );
}

#[test]
fn gmcm_probe_uses_serialized_member_names_for_fields_and_current_values() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let game_root = create_temp_dir("launcher-mod-config-serialized-name-game");
    let mods_root = game_root.join("Mods");
    let root = mods_root.join("SerializedNameFixture");
    fs::create_dir_all(&root).expect("create serialized-name fixture root");
    write_gmcm_fixture_manifest(&root, "SerializedNameFixture");
    write_file(
        &root.join("config.json"),
        r#"{ "serialized_enabled": false, "newtonsoft_name": "Configured", "newtonsoft_field": "Field configured" }"#,
    );
    assert!(
        build_fake_gmcm_fixture_with_newtonsoft(
            &root,
            "SerializedNameFixture",
            r#"
using System;
using System.Text.Json.Serialization;
using Newtonsoft.Json;
using StardewModdingAPI;

public sealed class FixtureMod : Mod
{
    private ModConfig Config = new();

    public override void Entry(IModHelper helper)
    {
        Config = helper.ReadConfig<ModConfig>();
        if (Config.Mode != "Configured" || Config.FieldMode != "Field configured")
        {
            throw new InvalidOperationException("Newtonsoft.Json aliases and public fields must be deserialized before registration.");
        }
        helper.Events.GameLoop.GameLaunched += (_, _) =>
        {
            var api = helper.ModRegistry.GetApi<IGenericModConfigMenuApi>("spacechase0.GenericModConfigMenu");
            if (api == null) return;
            api.Register(ModManifest, () => Config = new ModConfig(), () => helper.WriteConfig(Config));
            api.AddBoolOption(ModManifest, () => Config.Enabled, value => Config.Enabled = value, () => "Enabled", () => "Enabled tooltip", "enabled-toggle");
            api.AddTextOption(ModManifest, () => Config.Mode, value => Config.Mode = value, () => "Mode", () => "Mode tooltip", "mode-picker");
            api.AddTextOption(ModManifest, () => Config.FieldMode, value => Config.FieldMode = value, () => "Field mode", () => "Field mode tooltip", "field-mode-picker");
        };
    }
}

public sealed class ModConfig
{
    [JsonPropertyName("serialized_enabled")]
    public bool Enabled { get; set; } = true;

    [JsonProperty("newtonsoft_name")]
    public string Mode { get; set; } = "Balanced";

    [JsonProperty("newtonsoft_field")]
    public string FieldMode = "Field default";
}

public interface IGenericModConfigMenuApi
{
    void Register(IManifest mod, Action reset, Action save);
    void AddBoolOption(IManifest mod, Func<bool> getValue, Action<bool> setValue, Func<string> name, Func<string> tooltip, string fieldId);
    void AddTextOption(IManifest mod, Func<string> getValue, Action<string> setValue, Func<string> name, Func<string> tooltip, string fieldId);
}
"#,
        ),
        "serialized-name fixture should build with Newtonsoft.Json"
    );

    let result = load_gmcm_fixture(&probe_path, &mods_root, &root);

    assert_eq!(result.probe_status, LauncherModConfigProbeStatus::Succeeded);
    let enabled = result
        .fields
        .iter()
        .find(|field| field.key == "serialized_enabled")
        .expect("System.Text.Json serialized field");
    assert_eq!(
        enabled.source,
        LauncherModConfigSource::GenericModConfigMenu
    );
    assert_eq!(enabled.value, json!(false));
    assert_eq!(enabled.default_value, Some(json!(true)));

    let mode = result
        .fields
        .iter()
        .find(|field| field.key == "newtonsoft_name")
        .expect("Newtonsoft.Json serialized field");
    assert_eq!(mode.source, LauncherModConfigSource::GenericModConfigMenu);
    assert_eq!(mode.value, json!("Configured"));
    assert_eq!(mode.default_value, Some(json!("Balanced")));
    let field_mode = result
        .fields
        .iter()
        .find(|field| field.key == "newtonsoft_field")
        .expect("Newtonsoft.Json public field");
    assert_eq!(field_mode.value, json!("Field configured"));
    assert_eq!(field_mode.default_value, Some(json!("Field default")));
    assert!(
        result
            .fields
            .iter()
            .all(|field| field.key != "Enabled" && field.key != "Mode")
    );
}

#[test]
fn gmcm_probe_resets_defaults_only_after_conditional_registration_completes() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let game_root = create_temp_dir("launcher-mod-config-conditional-registration-game");
    let mods_root = game_root.join("Mods");
    let root = mods_root.join("ConditionalRegistrationFixture");
    fs::create_dir_all(&root).expect("create conditional-registration fixture root");
    write_gmcm_fixture_manifest(&root, "ConditionalRegistrationFixture");
    write_file(
        &root.join("config.json"),
        r#"{ "ShowAdvanced": true, "Advanced": false }"#,
    );
    assert!(
        build_fake_gmcm_fixture(
            &root,
            "ConditionalRegistrationFixture",
            r#"
using System;
using StardewModdingAPI;

public sealed class FixtureMod : Mod
{
    private ModConfig Config = new();

    public override void Entry(IModHelper helper)
    {
        Config = helper.ReadConfig<ModConfig>();
        helper.Events.GameLoop.GameLaunched += (_, _) =>
        {
            var api = helper.ModRegistry.GetApi<IGenericModConfigMenuApi>("spacechase0.GenericModConfigMenu");
            if (api == null) return;
            api.Register(ModManifest, () => Config = new ModConfig(), () => helper.WriteConfig(Config));
            if (Config.ShowAdvanced)
            {
                api.AddBoolOption(ModManifest, () => Config.Advanced, value => Config.Advanced = value, () => "Advanced", () => "Advanced tooltip", "advanced-toggle");
            }
        };
    }
}

public sealed class ModConfig
{
    public bool ShowAdvanced { get; set; }
    public bool Advanced { get; set; } = true;
}

public interface IGenericModConfigMenuApi
{
    void Register(IManifest mod, Action reset, Action save);
    void AddBoolOption(IManifest mod, Func<bool> getValue, Action<bool> setValue, Func<string> name, Func<string> tooltip, string fieldId);
}
"#,
        ),
        "conditional-registration fixture should build"
    );

    let result = load_gmcm_fixture(&probe_path, &mods_root, &root);

    assert_eq!(result.probe_status, LauncherModConfigProbeStatus::Succeeded);
    let advanced = result
        .fields
        .iter()
        .find(|field| field.key == "Advanced")
        .expect("conditionally registered field");
    assert_eq!(
        advanced.source,
        LauncherModConfigSource::GenericModConfigMenu
    );
    assert_eq!(advanced.value, json!(false));
    assert_eq!(advanced.default_value, Some(json!(true)));
}

#[test]
fn gmcm_probe_discards_partial_fields_when_registration_throws() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let root = create_temp_dir("launcher-mod-config-partial-registration");
    write_gmcm_fixture_manifest(&root, "PartialRegistrationFixture");
    write_file(&root.join("config.json"), r#"{ "Enabled": false }"#);
    assert!(
        build_fake_gmcm_fixture(
            &root,
            "PartialRegistrationFixture",
            r#"
using System;
using StardewModdingAPI;

public sealed class FixtureMod : Mod
{
    private ModConfig Config = new();

    public override void Entry(IModHelper helper)
    {
        Config = helper.ReadConfig<ModConfig>();
        helper.Events.GameLoop.GameLaunched += (_, _) =>
        {
            var api = helper.ModRegistry.GetApi<IGenericModConfigMenuApi>("spacechase0.GenericModConfigMenu");
            if (api == null) return;
            api.Register(ModManifest, () => Config = new ModConfig(), () => helper.WriteConfig(Config));
            api.AddBoolOption(ModManifest, () => Config.Enabled, value => Config.Enabled = value, () => "Enabled", () => "Enabled tooltip", "Enabled");
            throw new InvalidOperationException("fixture exploded after registration");
        };
    }
}

public sealed class ModConfig
{
    public bool Enabled { get; set; } = true;
}

public interface IGenericModConfigMenuApi
{
    void Register(IManifest mod, Action reset, Action save);
    void AddBoolOption(IManifest mod, Func<bool> getValue, Action<bool> setValue, Func<string> name, Func<string> tooltip, string fieldId);
}
"#,
        ),
        "partial-registration fixture should build"
    );

    let result = run_gmcm_runtime_probe(&probe_path, &root);

    assert_eq!(result.get("probeStatus"), Some(&json!("unavailable")));
    assert_eq!(
        result.pointer("/diagnostics/gmcmFieldsCaptured"),
        Some(&json!(0))
    );
    assert!(
        result
            .get("fields")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .all(|field| field.get("source") != Some(&json!("generic-mod-config-menu")))
    );
    assert!(
        result
            .pointer("/diagnostics/failureStage")
            .and_then(Value::as_str)
            .is_some_and(|stage| !stage.is_empty())
    );
    let assembly_warnings = result
        .pointer("/diagnostics/assemblyLoadWarnings")
        .and_then(Value::as_array)
        .expect("rollback diagnostics");
    assert!(
        assembly_warnings
            .iter()
            .filter_map(Value::as_str)
            .any(|warning| { warning.contains("discarded 1 GMCM field(s)") })
    );
    assert!(
        assembly_warnings
            .iter()
            .filter_map(Value::as_str)
            .any(|warning| { warning.contains("fixture exploded after registration") })
    );
}

#[test]
fn gmcm_probe_uses_field_id_when_getter_member_inference_is_ambiguous() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let game_root = create_temp_dir("launcher-mod-config-ambiguous-getter-game");
    let mods_root = game_root.join("Mods");
    let root = mods_root.join("AmbiguousGetterFixture");
    fs::create_dir_all(&root).expect("create ambiguous-getter fixture root");
    write_gmcm_fixture_manifest(&root, "AmbiguousGetterFixture");
    write_file(
        &root.join("config.json"),
        r#"{ "First": true, "Second": false }"#,
    );
    assert!(
        build_fake_gmcm_fixture(
            &root,
            "AmbiguousGetterFixture",
            r#"
using System;
using StardewModdingAPI;

public sealed class FixtureMod : Mod
{
    private ModConfig Config = new();

    public override void Entry(IModHelper helper)
    {
        Config = helper.ReadConfig<ModConfig>();
        helper.Events.GameLoop.GameLaunched += (_, _) =>
        {
            var api = helper.ModRegistry.GetApi<IGenericModConfigMenuApi>("spacechase0.GenericModConfigMenu");
            if (api == null) return;
            api.Register(ModManifest, () => Config = new ModConfig(), () => helper.WriteConfig(Config));
            api.AddBoolOption(
                ModManifest,
                () => Config.First || Config.Second,
                value => Config.Second = value,
                () => "Second toggle",
                () => "A derived value with two possible backing members.",
                "second-toggle");
        };
    }
}

public sealed class ModConfig
{
    public bool First { get; set; }
    public bool Second { get; set; } = true;
}

public interface IGenericModConfigMenuApi
{
    void Register(IManifest mod, Action reset, Action save);
    void AddBoolOption(IManifest mod, Func<bool> getValue, Action<bool> setValue, Func<string> name, Func<string> tooltip, string fieldId);
}
"#,
        ),
        "ambiguous-getter fixture should build"
    );

    let result = run_gmcm_runtime_probe(&probe_path, &root);

    assert_eq!(result.get("probeStatus"), Some(&json!("succeeded")));
    assert!(
        result
            .pointer("/diagnostics/failureStage")
            .is_none_or(Value::is_null)
    );
    let gmcm_fields = result
        .get("fields")
        .and_then(Value::as_array)
        .expect("probe fields")
        .iter()
        .filter(|field| field.get("source") == Some(&json!("generic-mod-config-menu")))
        .collect::<Vec<_>>();
    assert_eq!(gmcm_fields.len(), 1);
    assert_eq!(gmcm_fields[0].get("key"), Some(&json!("second-toggle")));
    assert!(gmcm_fields.iter().all(|field| {
        !matches!(
            field.get("key").and_then(Value::as_str),
            Some("First" | "Second" | "Key2")
        )
    }));
    assert!(
        result
            .pointer("/diagnostics/assemblyLoadWarnings")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .any(|warning| warning.contains("backing config member could not be inferred"))
    );

    let merged = load_gmcm_fixture(&probe_path, &mods_root, &root);
    let ambiguous = merged
        .fields
        .iter()
        .find(|field| field.key == "second-toggle")
        .expect("ambiguous GMCM field");
    assert!(
        !ambiguous.editable,
        "a GMCM field ID without a proven config key must not offer a fake save path"
    );
}

#[test]
fn gmcm_probe_uses_bounded_file_output_without_pipe_backpressure() {
    let root = create_temp_dir("launcher-mod-config-noisy-probe");
    let probe_path = build_fake_noisy_probe(&root).expect("build noisy probe fixture");

    let error = run_probe_with_timeout(
        &probe_path,
        &root,
        None,
        "inspect",
        Duration::from_millis(250),
        Duration::from_secs(3),
    )
    .expect_err("oversized probe output must be rejected");

    let message = format!("{error:#}");
    assert!(
        message.contains("probe output exceeded")
            && message.contains(&GMCM_PROBE_OUTPUT_LIMIT.to_string()),
        "unexpected output-limit error: {message}"
    );
    let probe_temp_dir = PathBuf::from(
        fs::read_to_string(root.join("noisy-probe-cwd.txt"))
            .expect("read noisy probe working directory"),
    );
    assert!(
        !probe_temp_dir.exists(),
        "probe temp directory should be removed after an output-limit failure: {}",
        probe_temp_dir.display()
    );
}

#[test]
fn gmcm_probe_cleans_descendants_and_temp_directory_after_normal_exit() {
    let root = create_temp_dir("launcher-mod-config-descendant-probe");
    let probe_path = build_fake_descendant_probe(&root).expect("build descendant probe fixture");

    let output = run_probe_with_timeout(
        &probe_path,
        &root,
        None,
        "inspect",
        Duration::from_secs(2),
        Duration::from_secs(4),
    )
    .expect("run descendant probe")
    .expect("descendant probe should finish before the parent timeout");

    assert!(output.status.success());
    let stdout: Value = serde_json::from_slice(&output.stdout).expect("parse probe stdout");
    assert_eq!(stdout.get("probeStatus"), Some(&json!("not-run")));
    assert!(root.join("descendant-started.txt").is_file());

    let probe_temp_dir = PathBuf::from(
        fs::read_to_string(root.join("probe-cwd.txt")).expect("read probe working directory"),
    );
    assert!(
        !probe_temp_dir.exists(),
        "probe temp directory should be removed after a normal exit: {}",
        probe_temp_dir.display()
    );

    std::thread::sleep(Duration::from_millis(900));
    assert!(
        !root.join("descendant-survived.txt").exists(),
        "a descendant outlived the normally exited probe process"
    );
}

#[test]
fn gmcm_probe_diagnostics_merge_corrects_detection_candidates_and_failure_stage() {
    let inspect = ProbePayload {
        result: json!({
            "probeStatus": "not-run",
            "fields": [{ "key": "Enabled", "source": "generic-mod-config-menu" }],
            "diagnostics": {
                "gmcmDetected": false,
                "failureStage": "metadata",
                "registrationCandidates": [{ "metadataToken": 1 }]
            }
        })
        .as_object()
        .expect("inspect payload")
        .clone(),
        duration_ms: 10,
        stderr: None,
        process_succeeded: true,
    };
    let runtime = ProbePayload {
        result: json!({
            "probeStatus": "unavailable",
            "fields": [{ "key": "Partial", "source": "generic-mod-config-menu" }],
            "diagnostics": {
                "gmcmDetected": false,
                "failureStage": "event:GameLaunched",
                "registrationCandidates": [{ "metadataToken": 2 }]
            }
        })
        .as_object()
        .expect("runtime payload")
        .clone(),
        duration_ms: 20,
        stderr: None,
        process_succeeded: true,
    };

    assert_eq!(probe_gmcm_detected(&inspect), Some(true));
    let diagnostics = merged_probe_diagnostics(
        Some(&inspect),
        Some(&runtime),
        Some(true),
        true,
        None,
        Some("runtime-timeout"),
        false,
    );
    assert_eq!(diagnostics.get("gmcmDetected"), Some(&json!(true)));
    assert_eq!(
        diagnostics.get("failureStage"),
        Some(&json!("runtime-timeout"))
    );
    assert_eq!(
        diagnostics
            .get("registrationCandidates")
            .and_then(Value::as_array)
            .map(Vec::len),
        Some(2)
    );
    let unavailable_diagnostics = merged_probe_diagnostics(
        Some(&inspect),
        Some(&runtime),
        Some(true),
        true,
        None,
        None,
        false,
    );
    assert_eq!(
        unavailable_diagnostics.get("failureStage"),
        Some(&json!("event:GameLaunched")),
        "an unavailable runtime must retain its specific failure stage"
    );
    assert_eq!(
        launcher_probe_status(true, Some(&ProbeAttempt::Completed(runtime)), Some(true)),
        LauncherModConfigProbeStatus::Unavailable,
        "captured fields must not upgrade an unavailable runtime result"
    );

    let inspect_failure = ProbePayload {
        result: json!({
            "probeStatus": "failed",
            "fields": [],
            "diagnostics": { "failureStage": "metadata", "gmcmDetected": true }
        })
        .as_object()
        .expect("inspect failure payload")
        .clone(),
        duration_ms: 5,
        stderr: None,
        process_succeeded: true,
    };
    let runtime_success = ProbePayload {
        result: json!({
            "probeStatus": "succeeded",
            "fields": [{ "key": "Enabled", "source": "generic-mod-config-menu" }],
            "diagnostics": { "gmcmDetected": true, "gmcmFieldsCaptured": 1 }
        })
        .as_object()
        .expect("runtime success payload")
        .clone(),
        duration_ms: 10,
        stderr: None,
        process_succeeded: true,
    };
    let success_diagnostics = merged_probe_diagnostics(
        Some(&inspect_failure),
        Some(&runtime_success),
        Some(true),
        true,
        None,
        None,
        true,
    );
    assert!(
        success_diagnostics
            .get("failureStage")
            .is_none_or(Value::is_null),
        "a successful runtime must clear an earlier inspect failure stage"
    );
}

#[test]
fn load_launcher_mod_config_uses_content_patcher_schema_and_current_values() {
    let root = create_temp_dir("launcher-mod-config-cp");
    write_manifest(
        &root,
        r#"{
    "Enabled": {
      "Default": true,
      "Description": "Turns it on.",
      "AllowValues": "true,false"
    },
    "Mode": {
      "Default": "Balanced",
      "AllowValues": ["Balanced", "Fast"]
    },
    "Tags": {
      "Default": ["A"],
      "AllowValues": ["A", "B"],
      "AllowMultiple": true
    }
  }"#,
    );
    write_file(
        &root.join("config.json"),
        r#"{ "enabled": false, "Extra": 3 }"#,
    );

    let result = load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: root.to_string_lossy().into_owned(),
        locale: None,
    })
    .expect("load config");

    assert!(result.config_exists);
    assert!(
        result
            .schema_sources
            .contains(&LauncherModConfigSource::ContentPatcher)
    );
    assert!(
        result
            .schema_sources
            .contains(&LauncherModConfigSource::ConfigJson)
    );
    let enabled = result
        .fields
        .iter()
        .find(|field| field.key == "Enabled")
        .expect("enabled field");
    assert_eq!(enabled.source, LauncherModConfigSource::ContentPatcher);
    assert_eq!(enabled.field_type, LauncherModConfigFieldType::Boolean);
    assert_eq!(enabled.value, json!(false));
    assert_eq!(enabled.default_value, Some(json!(true)));
    assert_eq!(enabled.allow_values, vec![json!("true"), json!("false")]);
    assert_eq!(
        result
            .fields
            .iter()
            .filter(|field| field.key.eq_ignore_ascii_case("Enabled"))
            .count(),
        1,
        "config casing must not create a duplicate fallback field"
    );

    let tags = result
        .fields
        .iter()
        .find(|field| field.key == "Tags")
        .expect("tags field");
    assert_eq!(tags.field_type, LauncherModConfigFieldType::StringArray);
    assert!(tags.allow_multiple);

    let extra = result
        .fields
        .iter()
        .find(|field| field.key == "Extra")
        .expect("extra field");
    assert_eq!(extra.source, LauncherModConfigSource::ConfigJson);
    assert_eq!(extra.field_type, LauncherModConfigFieldType::Integer);
}

#[test]
fn load_launcher_mod_config_uses_local_options_schema_fallback() {
    let root = create_temp_dir("launcher-mod-config-options-schema");
    write_manifest(&root, "{}");
    fs::create_dir_all(root.join("assets")).expect("create assets");
    write_file(
        &root.join("assets").join("options.json"),
        r##"[
  { "Name": "0", "Type": "page" },
  { "Name": "GeneralLabel", "Type": "subtitle" },
  { "Name": "Enabled", "Type": "bool", "Default": "True", "ToolTipKey": "GMCM.Options.Enabled.ToolTip" },
  { "Name": "AccentColor", "Type": "color", "Default": "#67b36f" },
  { "Name": "RewardItem", "Type": "item", "Default": "(O)24" },
  { "Name": "RewardItems", "Type": "item-list", "Default": ["(O)24", "(O)74"] },
  { "Name": "Mode", "Type": "string", "AllowedValues": "Simple, Advanced", "Default": "Simple" }
]"##,
    );
    fs::create_dir_all(root.join("i18n")).expect("create i18n");
    write_file(
        &root.join("i18n").join("en.json"),
        r#"{
  "GMCM.PageTitle.0": "General",
  "GMCM.Title.GeneralLabel.Name": "Enabled feature",
  "GMCM.Options.Enabled.ToolTip": "Turns the feature on."
}"#,
    );
    write_file(
        &root.join("config.json"),
        r##"{ "Enabled": "False", "AccentColor": "#ff3366", "mode": "Advanced", "Extra": 3 }"##,
    );

    let result = load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: root.to_string_lossy().into_owned(),
        locale: Some("en-US".to_string()),
    })
    .expect("load config");

    let enabled = result
        .fields
        .iter()
        .find(|field| field.key == "Enabled")
        .expect("enabled field");
    assert_eq!(enabled.source, LauncherModConfigSource::DllStatic);
    assert_eq!(enabled.field_type, LauncherModConfigFieldType::String);
    assert_eq!(enabled.value, json!("False"));
    assert_eq!(enabled.default_value, Some(json!("True")));
    assert_eq!(enabled.allow_values, vec![json!("True"), json!("False")]);
    assert_eq!(
        enabled.description.as_deref(),
        Some("Turns the feature on.")
    );
    assert_eq!(enabled.label, "Enabled feature");
    assert_eq!(enabled.section.as_deref(), Some("General"));

    let accent_color = result
        .fields
        .iter()
        .find(|field| field.key == "AccentColor")
        .expect("accent color field");
    assert_eq!(accent_color.ui_hint, Some(LauncherModConfigUiHint::Color));

    let reward_item = result
        .fields
        .iter()
        .find(|field| field.key == "RewardItem")
        .expect("reward item field");
    assert_eq!(reward_item.ui_hint, Some(LauncherModConfigUiHint::Item));
    assert_eq!(reward_item.field_type, LauncherModConfigFieldType::String);

    let reward_items = result
        .fields
        .iter()
        .find(|field| field.key == "RewardItems")
        .expect("reward items field");
    assert_eq!(
        reward_items.ui_hint,
        Some(LauncherModConfigUiHint::ItemList)
    );
    assert_eq!(
        reward_items.field_type,
        LauncherModConfigFieldType::StringArray
    );

    let mode = result
        .fields
        .iter()
        .find(|field| field.key == "Mode")
        .expect("mode field");
    assert_eq!(mode.source, LauncherModConfigSource::DllStatic);
    assert_eq!(mode.allow_values, vec![json!("Simple"), json!("Advanced")]);
    assert_eq!(mode.value, json!("Advanced"));
    assert_eq!(
        result
            .fields
            .iter()
            .filter(|field| field.key.eq_ignore_ascii_case("Mode"))
            .count(),
        1
    );

    let extra = result
        .fields
        .iter()
        .find(|field| field.key == "Extra")
        .expect("extra field");
    assert_eq!(extra.source, LauncherModConfigSource::ConfigJson);
}

#[test]
fn load_launcher_mod_config_resolves_content_pack_translations_without_misclassifying_color_enums()
{
    let temp_root = create_temp_dir("launcher-mod-config-content-pack-translations");
    let mods_root = temp_root.join("Mods");
    let root = mods_root.join("Cauldron");
    fs::create_dir_all(root.join("assets")).expect("create mod assets");
    write_file(
        &root.join("manifest.json"),
        r#"{
  "Name": "Cauldron",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "Atelier.Cauldron"
}"#,
    );
    write_file(
        &root.join("assets").join("options.json"),
        r#"[
  { "Name": "0", "Type": "page", "PageID": "0" },
  { "Name": "MachineColorEnable", "Type": "subtitle" },
  {
    "Name": "MachineColor",
    "Type": "string",
    "AllowedValues": "Base, Cream, Mint",
    "Default": "Base",
    "ToolTipKey": "GMCM.Options.MachineColor.ToolTip"
  }
]"#,
    );
    write_file(&root.join("config.json"), r#"{ "MachineColor": "Cream" }"#);

    let translation_root = mods_root.join("Cauldron Chinese");
    fs::create_dir_all(&translation_root).expect("create translation pack");
    write_file(
        &translation_root.join("manifest.json"),
        r#"{
  "Name": "Cauldron Chinese",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "Example.CauldronChinese",
  "Dependencies": [{ "UniqueID": "Atelier.Cauldron", "IsRequired": true }]
}"#,
    );
    write_file(
        &translation_root.join("content.json"),
        r#"{
  "Changes": [{
    "Action": "EditData",
    "Target": "Atelier.Cauldron/Translations",
    "Entries": {
      "zh-CN": {
        "GMCM.PageTitle.0": "全局选项",
        "GMCM.Title.MachineColorEnable.Name": "选择机器色调",
        "GMCM.Options.MachineColor.ToolTip": "选择工匠机器的色彩风格。"
      }
    }
  }]
}"#,
    );
    let english_root = mods_root.join("Cauldron English");
    fs::create_dir_all(&english_root).expect("create English translation pack");
    write_file(
        &english_root.join("manifest.json"),
        r#"{
  "Name": "Cauldron English",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "Example.CauldronEnglish",
  "Dependencies": [{ "UniqueID": "Atelier.Cauldron", "IsRequired": true }]
}"#,
    );
    write_file(
        &english_root.join("content.json"),
        r#"{
  "Changes": [{
    "Action": "EditData",
    "Target": "Atelier.Cauldron/Translations",
    "Entries": {
      "en": {
        "GMCM.PageTitle.0": "Global Options",
        "GMCM.Title.MachineColorEnable.Name": "Choose Machine Color",
        "GMCM.Options.MachineColor.ToolTip": "Choose a machine palette."
      }
    }
  }]
}"#,
    );

    let result = load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: root.to_string_lossy().into_owned(),
        locale: Some("zh-CN".to_string()),
    })
    .expect("load translated config");

    let machine_color = result
        .fields
        .iter()
        .find(|field| field.key == "MachineColor")
        .expect("machine color field");
    assert_eq!(machine_color.section.as_deref(), Some("全局选项"));
    assert_eq!(machine_color.label, "选择机器色调");
    assert_eq!(
        machine_color.description.as_deref(),
        Some("选择工匠机器的色彩风格。")
    );
    assert_eq!(machine_color.value, json!("Cream"));
    assert_eq!(
        machine_color.allow_values,
        vec![json!("Base"), json!("Cream"), json!("Mint")]
    );
    assert_eq!(machine_color.ui_hint, None);
}

#[test]
fn load_launcher_mod_config_does_not_warn_when_config_pack_has_no_dll() {
    let root = create_temp_dir("launcher-mod-config-no-dll");
    write_manifest(&root, "{}");
    write_file(
        &root.join("config.json"),
        r#"{ "Enabled": true, "Mode": "Simple" }"#,
    );

    let result = load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: root.to_string_lossy().into_owned(),
        locale: None,
    })
    .expect("load config");

    assert_eq!(result.probe_status, LauncherModConfigProbeStatus::NotRun);
    assert!(
        result.warnings.is_empty(),
        "no-DLL content/config packs should not surface probe diagnostics: {:?}",
        result.warnings
    );
    assert!(result.fields.iter().any(|field| field.key == "Enabled"));
}

#[test]
fn load_launcher_mod_config_runs_runtime_when_gmcm_is_detected_despite_complete_schema() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let game_root = create_temp_dir("launcher-mod-config-schema-complete-game");
    let root = game_root.join("Mods").join("FakeGmcmMod");
    fs::create_dir_all(&root).expect("create fake mod root");
    write_gmcm_manifest(
        &root,
        r#"{
  "Enabled": {},
  "Mode": {},
  "OpenMenuKey": {},
  "Unknown": {}
}"#,
    );
    write_file(
        &root.join("config.json"),
        r#"{ "Enabled": false, "Mode": "Fast", "OpenMenuKey": "P", "Unknown": 12 }"#,
    );
    assert!(
        build_fake_gmcm_mod(&root),
        "schema-complete GMCM fixture should build"
    );

    let probe_game_path = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let mods_root = game_root.join("Mods");
    let _probe_environment = ProbeEnvironment::install(&probe_path, &probe_game_path, &mods_root);
    let result = load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: root.to_string_lossy().into_owned(),
        locale: None,
    })
    .expect("load schema-complete config");

    assert_eq!(result.probe_status, LauncherModConfigProbeStatus::Succeeded);
    assert_eq!(
        result
            .probe_diagnostics
            .as_ref()
            .and_then(|diagnostics| diagnostics.get("gmcmDetected")),
        Some(&json!(true))
    );
    assert_eq!(
        result
            .probe_diagnostics
            .as_ref()
            .and_then(|diagnostics| diagnostics.get("runtimeAttempted")),
        Some(&json!(true))
    );
    assert!(
        result
            .probe_diagnostics
            .as_ref()
            .and_then(|diagnostics| diagnostics.get("runtimeSkipReason"))
            .is_none()
    );
    assert!(
        result
            .fields
            .iter()
            .all(|field| field.source != LauncherModConfigSource::GenericModConfigMenu)
    );
}

#[test]
fn load_launcher_mod_config_skips_runtime_when_gmcm_is_not_detected() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let game_root = create_temp_dir("launcher-mod-config-no-gmcm-game");
    let root = game_root.join("Mods").join("StaticConfigMod");
    fs::create_dir_all(&root).expect("create static config mod root");
    write_file(
        &root.join("manifest.json"),
        r#"{
  "Name": "Static Config Test",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "ModForge.StaticConfigTest",
  "EntryDll": "FakeStaticConfigMod.dll"
}"#,
    );
    write_file(
        &root.join("config.json"),
        r#"{ "Enabled": false, "Mode": "Custom" }"#,
    );
    assert!(
        build_fake_static_config_mod(&root),
        "non-GMCM static fixture should build"
    );

    let probe_game_path = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let mods_root = game_root.join("Mods");
    let _probe_environment = ProbeEnvironment::install(&probe_path, &probe_game_path, &mods_root);
    let result = load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: root.to_string_lossy().into_owned(),
        locale: None,
    })
    .expect("load static config");

    assert_eq!(result.probe_status, LauncherModConfigProbeStatus::NotRun);
    assert_eq!(
        result
            .probe_diagnostics
            .as_ref()
            .and_then(|diagnostics| diagnostics.get("gmcmDetected")),
        Some(&json!(false))
    );
    assert_eq!(
        result
            .probe_diagnostics
            .as_ref()
            .and_then(|diagnostics| diagnostics.get("runtimeAttempted")),
        Some(&json!(false))
    );
    assert_eq!(
        result
            .probe_diagnostics
            .as_ref()
            .and_then(|diagnostics| diagnostics.get("runtimeSkipReason")),
        Some(&json!("gmcm-not-detected"))
    );
    assert!(result.fields.iter().any(|field| {
        field.key == "Enabled" && field.source == LauncherModConfigSource::ConfigJson
    }));
    assert!(
        result
            .fields
            .iter()
            .all(|field| field.source != LauncherModConfigSource::DllStatic),
        "an arbitrary Config-named DTO must not be promoted to a static schema"
    );
}

#[test]
fn load_launcher_mod_config_keeps_inspect_warnings_when_runtime_is_outside_mods_root() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let configured_mods_root = create_temp_dir("launcher-mod-config-configured-mods");
    let root = create_temp_dir("launcher-mod-config-outside-mods");
    write_file(
        &root.join("manifest.json"),
        r#"{
  "Name": "Broken Probe Test",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "ModForge.BrokenProbeTest",
  "EntryDll": "Broken.dll"
}"#,
    );
    write_file(&root.join("Broken.dll"), "not a managed assembly");
    write_file(&root.join("config.json"), r#"{ "Enabled": true }"#);

    let probe_game_path = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let _probe_environment =
        ProbeEnvironment::install(&probe_path, &probe_game_path, &configured_mods_root);
    let result = load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: root.to_string_lossy().into_owned(),
        locale: None,
    })
    .expect("load outside-root config");

    assert_eq!(result.probe_status, LauncherModConfigProbeStatus::NotRun);
    assert_eq!(
        result
            .probe_diagnostics
            .as_ref()
            .and_then(|diagnostics| diagnostics.get("runtimeAttempted")),
        Some(&json!(false))
    );
    assert_eq!(
        result
            .probe_diagnostics
            .as_ref()
            .and_then(|diagnostics| diagnostics.get("runtimeSkipReason")),
        Some(&json!("outside-configured-mods-root"))
    );
    assert_eq!(
        result
            .probe_diagnostics
            .as_ref()
            .and_then(|diagnostics| diagnostics.get("failureStage")),
        Some(&json!("metadata"))
    );
    assert!(
        result
            .warnings
            .iter()
            .any(|warning| warning.contains("metadata inspection failed")),
        "inspect warnings should survive an intentional runtime skip: {:?}",
        result.warnings
    );
}

#[test]
fn load_launcher_mod_config_runs_gmcm_for_empty_or_partial_explicit_schema() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let game_root = create_temp_dir("launcher-mod-config-incomplete-schema-game");
    let mods_root = game_root.join("Mods");
    let partial_root = mods_root.join("PartialSchema");
    let empty_root = mods_root.join("EmptyConfig");
    fs::create_dir_all(&partial_root).expect("create partial-schema mod root");
    fs::create_dir_all(&empty_root).expect("create empty-config mod root");

    write_gmcm_manifest(&partial_root, r#"{ "Enabled": {} }"#);
    write_file(&partial_root.join("config.json"), r#"{ "Enabled": false }"#);
    write_gmcm_manifest(
        &empty_root,
        r#"{ "Enabled": {}, "Mode": {}, "OpenMenuKey": {} }"#,
    );
    write_file(&empty_root.join("config.json"), "{}");
    assert!(
        build_fake_gmcm_mod(&partial_root) && build_fake_gmcm_mod(&empty_root),
        "incomplete-schema GMCM fixtures should build"
    );

    let probe_game_path = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let _probe_environment = ProbeEnvironment::install(&probe_path, &probe_game_path, &mods_root);
    let partial = load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: partial_root.to_string_lossy().into_owned(),
        locale: None,
    })
    .expect("load partial-schema config");
    let empty = load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: empty_root.to_string_lossy().into_owned(),
        locale: None,
    })
    .expect("load empty config");

    for result in [&partial, &empty] {
        assert_eq!(
            result
                .probe_diagnostics
                .as_ref()
                .and_then(|diagnostics| diagnostics.get("runtimeAttempted")),
            Some(&json!(true))
        );
        assert_eq!(result.probe_status, LauncherModConfigProbeStatus::Succeeded);
    }
    assert!(partial.fields.iter().any(|field| {
        field.key == "Mode" && field.source == LauncherModConfigSource::GenericModConfigMenu
    }));
}

#[test]
fn load_launcher_mod_config_probes_nested_manifest_entry_dll() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let game_root = create_temp_dir("launcher-mod-config-nested-entry-game");
    let mods_root = game_root.join("Mods");
    let root = mods_root.join("NestedEntry");
    let entry_root = root.join("code");
    fs::create_dir_all(&entry_root).expect("create nested entry root");
    write_file(
        &root.join("manifest.json"),
        r#"{
  "Name": "Nested Entry Test",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "ModForge.NestedEntryTest",
  "EntryDll": "code/FakeGmcmMod.dll"
}"#,
    );
    write_file(
        &root.join("config.json"),
        r#"{ "Enabled": false, "Mode": "Fast", "OpenMenuKey": "P" }"#,
    );
    assert!(
        build_fake_gmcm_mod(&root),
        "nested EntryDll GMCM fixture should build"
    );
    fs::rename(
        root.join("FakeGmcmMod.dll"),
        entry_root.join("FakeGmcmMod.dll"),
    )
    .expect("move fake mod entry DLL");

    let probe_game_path = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let _probe_environment = ProbeEnvironment::install(&probe_path, &probe_game_path, &mods_root);
    let result = load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: root.to_string_lossy().into_owned(),
        locale: None,
    })
    .expect("load nested EntryDll config");

    assert_eq!(result.probe_status, LauncherModConfigProbeStatus::Succeeded);
    assert_eq!(
        result
            .probe_diagnostics
            .as_ref()
            .and_then(|diagnostics| diagnostics.get("runtimeAttempted")),
        Some(&json!(true))
    );
    assert!(result.fields.iter().any(|field| {
        field.key == "Mode" && field.source == LauncherModConfigSource::GenericModConfigMenu
    }));
}

#[test]
fn save_launcher_mod_config_merges_values_and_preserves_unknown_keys() {
    let root = create_temp_dir("launcher-mod-config-save");
    write_manifest(&root, "{}");
    write_file(
        &root.join("config.json"),
        r#"{ "Known": true, "enabled": true, " Enabled ": "keep-spaced", "Unknown": "keep" }"#,
    );
    let mut values = BTreeMap::new();
    values.insert("Known".to_string(), json!(false));
    values.insert("Enabled".to_string(), json!(false));

    let result = save_launcher_mod_config(SaveLauncherModConfigRequest {
        mod_path: root.to_string_lossy().into_owned(),
        locale: None,
        values,
    })
    .expect("save config");

    assert!(result.config_exists);
    let saved: Value =
        serde_json::from_str(&fs::read_to_string(root.join("config.json")).expect("read saved"))
            .expect("saved json");
    assert_eq!(saved.get("Known"), Some(&json!(false)));
    assert_eq!(saved.get("enabled"), Some(&json!(false)));
    assert!(
        saved.get("Enabled").is_none(),
        "case-insensitive saves must update the existing key instead of adding a duplicate"
    );
    assert_eq!(saved.get(" Enabled "), Some(&json!("keep-spaced")));
    assert_eq!(saved.get("Unknown"), Some(&json!("keep")));
}

#[test]
fn save_launcher_mod_config_collapses_duplicate_case_variants() {
    let root = create_temp_dir("launcher-mod-config-save-duplicates");
    write_manifest(&root, "{}");
    write_file(
        &root.join("config.json"),
        r#"{ "Enabled": true, "ENABLED": true, "Other": "keep" }"#,
    );
    let mut values = BTreeMap::new();
    values.insert("enabled".to_string(), json!(false));

    save_launcher_mod_config(SaveLauncherModConfigRequest {
        mod_path: root.to_string_lossy().into_owned(),
        locale: None,
        values,
    })
    .expect("save config with duplicate key casing");

    let saved: Value =
        serde_json::from_str(&fs::read_to_string(root.join("config.json")).expect("read saved"))
            .expect("saved json");
    let matching = saved
        .as_object()
        .expect("saved object")
        .iter()
        .filter(|(key, _)| key.eq_ignore_ascii_case("enabled"))
        .collect::<Vec<_>>();
    assert_eq!(matching.len(), 1);
    assert_eq!(matching[0].1, &json!(false));
    assert_eq!(saved.get("Other"), Some(&json!("keep")));
}

#[test]
fn gmcm_storage_key_reliability_requires_a_matching_config_key_for_edits() {
    let payload = ProbePayload {
        result: json!({
            "fields": [{
                "key": "derived-option",
                "label": "Derived option",
                "fieldType": "boolean",
                "source": "generic-mod-config-menu",
                "defaultValue": true,
                "storageKeyReliable": false
            }]
        })
        .as_object()
        .expect("probe payload")
        .clone(),
        duration_ms: 1,
        stderr: None,
        process_succeeded: true,
    };

    let mut fields = Vec::new();
    merge_probe_payload_fields(&payload, &serde_json::Map::new(), &mut fields, true);
    assert_eq!(fields.len(), 1);
    assert!(!fields[0].editable);
    assert_eq!(fields[0].default_value, None);

    let mut current_config = serde_json::Map::new();
    current_config.insert("DERIVED-OPTION".to_string(), json!(false));
    let mut fields = Vec::new();
    merge_probe_payload_fields(&payload, &current_config, &mut fields, true);
    assert_eq!(fields.len(), 1);
    assert!(fields[0].editable);
    assert_eq!(fields[0].value, json!(false));
    assert_eq!(fields[0].default_value, Some(json!(true)));

    let collision_payload = ProbePayload {
        result: json!({
            "fields": [{
                "key": "derived-option2",
                "label": "Derived collision",
                "fieldType": "boolean",
                "source": "generic-mod-config-menu",
                "defaultValue": true,
                "storageKeyReliable": false,
                "canMatchExistingConfigKey": false
            }]
        })
        .as_object()
        .expect("collision payload")
        .clone(),
        duration_ms: 1,
        stderr: None,
        process_succeeded: true,
    };
    let mut current_config = serde_json::Map::new();
    current_config.insert("derived-option2".to_string(), json!(false));
    let mut fields = Vec::new();
    merge_probe_payload_fields(&collision_payload, &current_config, &mut fields, true);
    assert_eq!(fields.len(), 1);
    assert!(!fields[0].editable);
    assert_eq!(fields[0].value, json!(false));
    assert_eq!(fields[0].default_value, None);
}

#[test]
fn load_launcher_mod_config_rejects_paths_without_manifest() {
    let root = create_temp_dir("launcher-mod-config-invalid");
    let error = load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: root.to_string_lossy().into_owned(),
        locale: None,
    })
    .expect_err("missing manifest should fail");

    assert!(error.to_string().contains("manifest.json"));
}

#[test]
fn save_launcher_mod_config_rejects_config_symlink_escape() {
    let root = create_temp_dir("launcher-mod-config-symlink");
    write_manifest(&root, "{}");
    let outside = root.with_file_name("launcher-mod-config-outside.json");
    write_file(&outside, r#"{ "Known": true }"#);

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&outside, root.join("config.json"))
            .expect("create config symlink");
    }
    #[cfg(windows)]
    {
        if let Err(error) = std::os::windows::fs::symlink_file(&outside, root.join("config.json")) {
            eprintln!("Skipping symlink escape test because symlink creation failed: {error}");
            return;
        }
    }

    let mut values = BTreeMap::new();
    values.insert("Known".to_string(), json!(false));
    let error = save_launcher_mod_config(SaveLauncherModConfigRequest {
        mod_path: root.to_string_lossy().into_owned(),
        locale: None,
        values,
    })
    .expect_err("symlink escape should be rejected");

    assert!(error.to_string().contains("outside the mod directory"));
    let saved: Value =
        serde_json::from_str(&fs::read_to_string(outside).expect("read outside config"))
            .expect("outside json");
    assert_eq!(saved.get("Known"), Some(&json!(true)));
}

#[test]
fn load_launcher_mod_config_merges_headless_gmcm_probe_fields() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let game_root = create_temp_dir("launcher-mod-config-gmcm-game");
    let root = game_root.join("Mods").join("FakeGmcmMod");
    fs::create_dir_all(&root).expect("create fake mod root");
    write_gmcm_manifest(&root, "{}");
    write_file(
        &root.join("config.json"),
        r#"{ "Enabled": false, "Mode": "Fast", "OpenMenuKey": "P", "Unknown": 12 }"#,
    );
    assert!(build_fake_gmcm_mod(&root), "GMCM fixture should build");

    let probe_game_path = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let mods_root = game_root.join("Mods");
    let _probe_environment = ProbeEnvironment::install(&probe_path, &probe_game_path, &mods_root);
    let result = load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: root.to_string_lossy().into_owned(),
        locale: None,
    })
    .expect("load config");

    assert_eq!(result.probe_status, LauncherModConfigProbeStatus::Succeeded);
    let enabled = result
        .fields
        .iter()
        .find(|field| field.key == "Enabled")
        .expect("enabled field");
    assert_eq!(
        enabled.source,
        LauncherModConfigSource::GenericModConfigMenu
    );
    assert_eq!(enabled.field_type, LauncherModConfigFieldType::Boolean);
    assert_eq!(enabled.value, json!(false));

    let mode = result
        .fields
        .iter()
        .find(|field| field.key == "Mode")
        .expect("mode field");
    assert_eq!(mode.source, LauncherModConfigSource::GenericModConfigMenu);
    assert_eq!(mode.allow_values, vec![json!("Balanced"), json!("Fast")]);

    let open_menu_key = result
        .fields
        .iter()
        .find(|field| field.key == "OpenMenuKey")
        .expect("keybind field");
    assert_eq!(
        open_menu_key.ui_hint,
        Some(LauncherModConfigUiHint::Keybind)
    );

    assert!(
        result
            .schema_sources
            .contains(&LauncherModConfigSource::GenericModConfigMenu)
    );
}

#[test]
fn gmcm_probe_uses_explicit_game_path_for_assembly_resolution() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let root = create_temp_dir("launcher-mod-config-gmcm-game-path");
    write_gmcm_manifest(&root, "{}");
    assert!(
        build_fake_gmcm_mod(&root),
        "game-path GMCM fixture should build"
    );

    let game_path = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let output = Command::new("dotnet")
        .arg(probe_path)
        .arg("--mod-path")
        .arg(&root)
        .arg("--game-path")
        .arg(&game_path)
        .arg("--timeout-ms")
        .arg(GMCM_REGRESSION_PROBE_TIMEOUT_MS)
        .output()
        .expect("run probe");
    assert!(
        output.status.success(),
        "probe failed: status={:?}\nstdout:\n{}\nstderr:\n{}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let result: Value =
        serde_json::from_slice(&output.stdout).expect("probe should return JSON result");
    assert_eq!(
        result.get("probeStatus"),
        Some(&json!("succeeded")),
        "probe stdout: {}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert_eq!(
        result
            .pointer("/diagnostics/gamePathResolved")
            .and_then(Value::as_str)
            .map(|value| PathBuf::from(value).canonicalize().ok())
            .flatten(),
        game_path.canonicalize().ok()
    );
    assert!(game_path.join("StardewModdingAPI.dll").is_file());
    assert!(game_path.join("SMAPI.Toolkit.CoreInterfaces.dll").is_file());
    assert!(
        result
            .get("fields")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .any(|field| field.get("source") == Some(&json!("generic-mod-config-menu")))
    );
}

#[test]
fn gmcm_probe_invokes_metadata_registration_when_mod_construction_fails() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let root = create_temp_dir("launcher-mod-config-gmcm-direct-registration");
    write_file(
        &root.join("manifest.json"),
        r#"{
  "Name": "Direct GMCM Test",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "ModForge.DirectGmcmTest",
  "EntryDll": "FakeDirectGmcmMod.dll"
}"#,
    );
    write_file(&root.join("config.json"), r#"{ "Enabled": false }"#);
    assert!(
        build_fake_direct_registration_mod(&root),
        "direct-registration GMCM fixture should build"
    );
    fs::copy(
        root.join("FakeDirectGmcmMod.dll"),
        root.join("SupportDependency.dll"),
    )
    .expect("copy fake support dependency");

    let game_path = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let output = Command::new("dotnet")
        .arg(probe_path)
        .arg("--mod-path")
        .arg(&root)
        .arg("--game-path")
        .arg(&game_path)
        .arg("--timeout-ms")
        .arg(GMCM_REGRESSION_PROBE_TIMEOUT_MS)
        .output()
        .expect("run probe");
    assert!(
        output.status.success(),
        "probe failed: status={:?}\nstdout:\n{}\nstderr:\n{}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let result: Value =
        serde_json::from_slice(&output.stdout).expect("probe should return JSON result");
    assert_eq!(result.pointer("/diagnostics/dllsScanned"), Some(&json!(1)));
    assert_eq!(result.get("warnings"), Some(&json!([])));
    assert!(
        result
            .get("fields")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .any(|field| {
                field.get("key") == Some(&json!("Enabled"))
                    && field.get("defaultValue") == Some(&json!(true))
                    && field.get("source") == Some(&json!("generic-mod-config-menu"))
            }),
        "probe stdout: {}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert!(
        result
            .pointer("/diagnostics/assemblyLoadWarnings")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .any(|warning| warning.contains("metadata registration candidate")),
        "probe stdout: {}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert_eq!(
        result.pointer("/diagnostics/captureStrategy"),
        Some(&json!("metadata-registration"))
    );
}

#[test]
fn gmcm_probe_invokes_static_multi_parameter_registration_candidate() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let root = create_temp_dir("launcher-mod-config-gmcm-static-registration");
    write_file(
        &root.join("manifest.json"),
        r#"{
  "Name": "Static GMCM Test",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "ModForge.StaticGmcmTest",
  "EntryDll": "FakeStaticGmcmMod.dll"
}"#,
    );
    write_file(&root.join("config.json"), r#"{ "Enabled": false }"#);
    assert!(
        build_fake_static_registration_mod(&root),
        "static-registration GMCM fixture should build"
    );

    let game_path = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let output = Command::new("dotnet")
        .arg(probe_path)
        .arg("--mode")
        .arg("runtime")
        .arg("--mod-path")
        .arg(&root)
        .arg("--game-path")
        .arg(&game_path)
        .arg("--timeout-ms")
        .arg(GMCM_REGRESSION_PROBE_TIMEOUT_MS)
        .output()
        .expect("run probe");
    assert!(
        output.status.success(),
        "probe failed: status={:?}\nstdout:\n{}\nstderr:\n{}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let result: Value =
        serde_json::from_slice(&output.stdout).expect("probe should return JSON result");
    assert_eq!(result.get("probeStatus"), Some(&json!("succeeded")));
    assert_eq!(result.get("warnings"), Some(&json!([])));
    assert_eq!(
        result.pointer("/diagnostics/captureStrategy"),
        Some(&json!("metadata-registration"))
    );
    assert!(
        result
            .pointer("/diagnostics/registrationCandidates")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .any(|candidate| {
                candidate.get("declaringType") == Some(&json!("StaticConfigMenu"))
                    && candidate.get("methodName") == Some(&json!("Setup"))
            }),
        "probe stdout: {}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert!(
        result
            .get("fields")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .any(|field| {
                field.get("key") == Some(&json!("Enabled"))
                    && field.get("defaultValue") == Some(&json!(true))
                    && field.get("source") == Some(&json!("generic-mod-config-menu"))
            }),
        "probe stdout: {}",
        String::from_utf8_lossy(&output.stdout)
    );
}

#[test]
fn gmcm_probe_runs_harmony_mods_with_noop_shim() {
    let _guard = env_lock();
    let probe_path = build_gmcm_probe();
    let root = create_temp_dir("launcher-mod-config-gmcm-harmony");
    write_gmcm_manifest(&root, "{}");
    assert!(
        build_fake_harmony_gmcm_mod(&root),
        "Harmony GMCM fixture should build"
    );

    let game_path = repo_root().join("apps/desktop/tools/gmcm-probe/bin/Release/net6.0");
    let output = Command::new("dotnet")
        .arg(probe_path)
        .arg("--mod-path")
        .arg(&root)
        .arg("--game-path")
        .arg(&game_path)
        .arg("--timeout-ms")
        .arg(GMCM_REGRESSION_PROBE_TIMEOUT_MS)
        .output()
        .expect("run probe");
    assert!(
        output.status.success(),
        "probe failed: status={:?}\nstdout:\n{}\nstderr:\n{}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let result: Value =
        serde_json::from_slice(&output.stdout).expect("probe should return JSON result");
    assert_eq!(
        result.get("probeStatus"),
        Some(&json!("succeeded")),
        "probe stdout: {}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert!(
        result
            .get("fields")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .any(|field| field.get("source") == Some(&json!("generic-mod-config-menu")))
    );
    assert!(
        result
            .pointer("/diagnostics/assemblyLoadWarnings")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .any(|warning| warning.contains("no-op Harmony shim")),
        "probe stdout: {}",
        String::from_utf8_lossy(&output.stdout)
    );
}
