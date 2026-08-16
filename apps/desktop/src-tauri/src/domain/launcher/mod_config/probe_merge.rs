use super::probe_run::{mod_has_probe_dll, probe_assembly_path, run_probe_with_timeout};
use crate::domain::app_paths::launcher_settings_path;
use crate::domain::launcher::settings::load_or_create_settings_at_path;
use crate::domain::launcher::types::{
    LauncherModConfigField, LauncherModConfigFieldType, LauncherModConfigProbeStatus,
    LauncherModConfigSource, LauncherModConfigUiHint,
};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use serde_json::{Map, Value};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const GMCM_INSPECT_CHILD_TIMEOUT: Duration = Duration::from_millis(1_000);
const GMCM_INSPECT_PARENT_TIMEOUT: Duration = Duration::from_millis(1_500);
const GMCM_RUNTIME_CHILD_TIMEOUT: Duration = Duration::from_millis(3_000);
const GMCM_RUNTIME_PARENT_TIMEOUT: Duration = Duration::from_millis(3_500);

fn field_type_from_probe(value: &str) -> LauncherModConfigFieldType {
    match value {
        "boolean" => LauncherModConfigFieldType::Boolean,
        "integer" => LauncherModConfigFieldType::Integer,
        "number" => LauncherModConfigFieldType::Number,
        "string-array" => LauncherModConfigFieldType::StringArray,
        "object" => LauncherModConfigFieldType::Object,
        "string" => LauncherModConfigFieldType::String,
        _ => LauncherModConfigFieldType::Unknown,
    }
}

fn ui_hint_from_probe(value: &str) -> Option<LauncherModConfigUiHint> {
    match value {
        "color" => Some(LauncherModConfigUiHint::Color),
        "item" => Some(LauncherModConfigUiHint::Item),
        "item-list" => Some(LauncherModConfigUiHint::ItemList),
        "keybind" => Some(LauncherModConfigUiHint::Keybind),
        "keybind-list" => Some(LauncherModConfigUiHint::KeybindList),
        _ => None,
    }
}

#[derive(Debug)]
pub(crate) struct ProbePayload {
    pub(crate) result: Map<String, Value>,
    pub(crate) duration_ms: u64,
    pub(crate) stderr: Option<String>,
    pub(crate) process_succeeded: bool,
}

#[derive(Debug)]
pub(crate) enum ProbeAttempt {
    Completed(ProbePayload),
    TimedOut { duration_ms: u64 },
    Failed { message: String, duration_ms: u64 },
}

fn elapsed_millis(started_at: Instant) -> u64 {
    started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64
}

fn run_probe_mode(
    probe_assembly_path: &Path,
    root: &Path,
    game_path: Option<&Path>,
    mode: &str,
    child_timeout: Duration,
    parent_timeout: Duration,
) -> ProbeAttempt {
    let started_at = Instant::now();
    match run_probe_with_timeout(
        probe_assembly_path,
        root,
        game_path,
        mode,
        child_timeout,
        parent_timeout,
    ) {
        Ok(Some(output)) => {
            let duration_ms = elapsed_millis(started_at);
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            match serde_json::from_slice::<Value>(&output.stdout) {
                Ok(Value::Object(result)) => ProbeAttempt::Completed(ProbePayload {
                    result,
                    duration_ms,
                    stderr: (!stderr.is_empty()).then_some(stderr),
                    process_succeeded: output.status.success(),
                }),
                _ => ProbeAttempt::Failed {
                    message: format!("GMCM {mode} probe returned invalid JSON."),
                    duration_ms,
                },
            }
        }
        Ok(None) => ProbeAttempt::TimedOut {
            duration_ms: elapsed_millis(started_at),
        },
        Err(error) => ProbeAttempt::Failed {
            message: format!("GMCM {mode} probe failed: {error}"),
            duration_ms: elapsed_millis(started_at),
        },
    }
}

fn probe_diagnostics(payload: &ProbePayload) -> Option<&Map<String, Value>> {
    payload.result.get("diagnostics").and_then(Value::as_object)
}

fn probe_status(payload: &ProbePayload) -> &str {
    payload
        .result
        .get("probeStatus")
        .and_then(Value::as_str)
        .unwrap_or("failed")
}

fn probe_gmcm_field_count(payload: &ProbePayload) -> u64 {
    let reported = probe_diagnostics(payload)
        .and_then(|diagnostics| diagnostics.get("gmcmFieldsCaptured"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let actual = payload
        .result
        .get("fields")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|field| {
            field.get("source").and_then(Value::as_str) == Some("generic-mod-config-menu")
        })
        .count() as u64;
    reported.max(actual)
}

fn probe_static_field_count(payload: &ProbePayload) -> u64 {
    let reported = probe_diagnostics(payload)
        .and_then(|diagnostics| diagnostics.get("staticFieldsCaptured"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let actual = payload
        .result
        .get("fields")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|field| field.get("source").and_then(Value::as_str) == Some("dll-static"))
        .count() as u64;
    reported.max(actual)
}

pub(crate) fn probe_gmcm_detected(payload: &ProbePayload) -> Option<bool> {
    if probe_gmcm_field_count(payload) > 0 {
        return Some(true);
    }
    probe_diagnostics(payload)
        .and_then(|diagnostics| diagnostics.get("gmcmDetected"))
        .and_then(Value::as_bool)
        .or_else(|| payload.result.get("gmcmDetected").and_then(Value::as_bool))
}

fn probe_static_field_keys(payload: &ProbePayload) -> BTreeSet<String> {
    payload
        .result
        .get("fields")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|field| field.get("source").and_then(Value::as_str) == Some("dll-static"))
        .filter_map(|field| field.get("key").and_then(Value::as_str))
        .map(normalized_config_key)
        .collect()
}

fn probe_warning_messages(payload: &ProbePayload, mode: &str) -> Vec<String> {
    let mut messages = payload
        .result
        .get("warnings")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    if !payload.process_succeeded
        && let Some(stderr) = payload.stderr.as_deref()
    {
        messages.push(format!("GMCM {mode} probe stderr: {stderr}"));
    }
    messages
}

fn push_unique_warnings(warnings: &mut Vec<String>, messages: impl IntoIterator<Item = String>) {
    for message in messages {
        if !warnings.contains(&message) {
            warnings.push(message);
        }
    }
}

pub(crate) fn normalized_config_key(key: &str) -> String {
    key.trim().to_ascii_lowercase()
}

fn is_valid_probe_field_key(key: &str) -> bool {
    let key = key.trim();
    !key.is_empty()
        && key.len() <= 160
        && !key
            .chars()
            .any(|character| character.is_control() || matches!(character, '/' | '\\'))
}

pub(crate) fn merge_probe_payload_fields(
    payload: &ProbePayload,
    current_config: &Map<String, Value>,
    fields: &mut Vec<LauncherModConfigField>,
    include_static_fields: bool,
) {
    let mut probe_fields = payload
        .result
        .get("fields")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_object)
        .filter(|field| {
            include_static_fields
                || field.get("source").and_then(Value::as_str) == Some("generic-mod-config-menu")
        })
        .collect::<Vec<_>>();
    probe_fields.sort_by_key(|field| {
        field.get("source").and_then(Value::as_str) != Some("generic-mod-config-menu")
    });
    for field in probe_fields {
        let Some(key) = field
            .get("key")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| is_valid_probe_field_key(value))
        else {
            continue;
        };
        if fields
            .iter()
            .any(|existing| existing.key.eq_ignore_ascii_case(key))
        {
            continue;
        }
        let default_value = field.get("defaultValue").cloned();
        let current_config_value = current_config
            .iter()
            .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
            .map(|(_, value)| value.clone());
        let has_current_config_key = current_config_value.is_some();
        let current_value = current_config_value
            .or_else(|| default_value.clone())
            .unwrap_or(Value::Null);
        let source = match field.get("source").and_then(Value::as_str) {
            Some("generic-mod-config-menu") => LauncherModConfigSource::GenericModConfigMenu,
            _ => LauncherModConfigSource::DllStatic,
        };
        let can_match_existing_config_key = field
            .get("canMatchExistingConfigKey")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        let editable = source != LauncherModConfigSource::GenericModConfigMenu
            || field
                .get("storageKeyReliable")
                .and_then(Value::as_bool)
                .unwrap_or(true)
            || can_match_existing_config_key && has_current_config_key;
        // A GMCM field ID without a verified storage key must not enter direct edits or reset-all.
        let exposed_default_value = editable.then_some(default_value).flatten();
        fields.push(LauncherModConfigField {
            key: key.to_string(),
            label: field
                .get("label")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(key)
                .to_string(),
            description: field
                .get("description")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            section: field
                .get("section")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            field_type: field_type_from_probe(
                field
                    .get("fieldType")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown"),
            ),
            ui_hint: field
                .get("uiHint")
                .and_then(Value::as_str)
                .and_then(ui_hint_from_probe),
            value: current_value,
            default_value: exposed_default_value,
            allow_values: field
                .get("allowValues")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default(),
            allow_blank: field
                .get("allowBlank")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            allow_multiple: field
                .get("allowMultiple")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            editable,
            source,
        });
    }
}

fn merge_diagnostic_array(target: &mut Map<String, Value>, key: &str, incoming: &[Value]) {
    let values = target
        .entry(key.to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(values) = values.as_array_mut() else {
        return;
    };
    for value in incoming {
        if !values.contains(value) {
            values.push(value.clone());
        }
    }
}

fn merge_probe_diagnostic_values(target: &mut Map<String, Value>, source: &Map<String, Value>) {
    const ARRAY_KEYS: &[&str] = &[
        "gameAssembliesResolved",
        "assemblyLoadWarnings",
        "dependencyAssembliesResolved",
        "assemblyResolveMisses",
        "assemblyReferences",
        "registrationCandidates",
    ];
    for (key, value) in source {
        if ARRAY_KEYS.contains(&key.as_str())
            && let Some(incoming) = value.as_array()
        {
            merge_diagnostic_array(target, key, incoming);
            continue;
        }
        if matches!(
            key.as_str(),
            "dllsScanned" | "smapiModsFound" | "gmcmFieldsCaptured" | "staticFieldsCaptured"
        ) && let Some(incoming) = value.as_u64()
        {
            let current = target.get(key).and_then(Value::as_u64).unwrap_or(0);
            target.insert(key.clone(), Value::from(current.max(incoming)));
            continue;
        }
        target.insert(key.clone(), value.clone());
    }
}

pub(crate) fn merged_probe_diagnostics(
    inspect: Option<&ProbePayload>,
    runtime: Option<&ProbePayload>,
    gmcm_detected: Option<bool>,
    runtime_attempted: bool,
    runtime_skip_reason: Option<&str>,
    failure_stage: Option<&str>,
    clear_failure_stage: bool,
) -> Value {
    let mut diagnostics = Map::new();
    if let Some(source) = inspect.and_then(probe_diagnostics) {
        merge_probe_diagnostic_values(&mut diagnostics, source);
    }
    if let Some(source) = runtime.and_then(probe_diagnostics) {
        merge_probe_diagnostic_values(&mut diagnostics, source);
    }

    let inspect_duration_ms = inspect.map(|payload| payload.duration_ms).unwrap_or(0);
    let runtime_duration_ms = runtime.map(|payload| payload.duration_ms).unwrap_or(0);
    diagnostics.insert(
        "executionMode".to_string(),
        Value::String(if runtime_attempted {
            "inspect+runtime".to_string()
        } else {
            "inspect".to_string()
        }),
    );
    diagnostics.insert(
        "runtimeAttempted".to_string(),
        Value::Bool(runtime_attempted),
    );
    if let Some(gmcm_detected) = gmcm_detected {
        diagnostics.insert("gmcmDetected".to_string(), Value::Bool(gmcm_detected));
    }
    if let Some(reason) = runtime_skip_reason {
        diagnostics.insert(
            "runtimeSkipReason".to_string(),
            Value::String(reason.to_string()),
        );
    }
    if let Some(stage) = failure_stage {
        let stage_has_specific_detail = match stage {
            "runtime" => runtime
                .and_then(probe_diagnostics)
                .and_then(|source| source.get("failureStage"))
                .is_some_and(Value::is_string),
            "inspect" => inspect
                .and_then(probe_diagnostics)
                .and_then(|source| source.get("failureStage"))
                .is_some_and(Value::is_string),
            _ => false,
        };
        if !stage_has_specific_detail {
            diagnostics.insert("failureStage".to_string(), Value::String(stage.to_string()));
        }
    }
    if clear_failure_stage {
        diagnostics.remove("failureStage");
    }
    diagnostics.insert(
        "inspectDurationMs".to_string(),
        Value::from(inspect_duration_ms),
    );
    diagnostics.insert(
        "runtimeDurationMs".to_string(),
        Value::from(runtime_duration_ms),
    );
    diagnostics.insert(
        "durationMs".to_string(),
        Value::from(inspect_duration_ms.saturating_add(runtime_duration_ms)),
    );
    Value::Object(diagnostics)
}

pub(crate) fn launcher_probe_status(
    runtime_attempted: bool,
    runtime_attempt: Option<&ProbeAttempt>,
    gmcm_detected: Option<bool>,
) -> LauncherModConfigProbeStatus {
    if !runtime_attempted {
        return LauncherModConfigProbeStatus::NotRun;
    }
    match runtime_attempt {
        Some(ProbeAttempt::TimedOut { .. }) => LauncherModConfigProbeStatus::TimedOut,
        Some(ProbeAttempt::Failed { .. }) | None => LauncherModConfigProbeStatus::Failed,
        Some(ProbeAttempt::Completed(payload))
            if probe_gmcm_field_count(payload) > 0
                && payload.process_succeeded
                && probe_status(payload) == "succeeded" =>
        {
            LauncherModConfigProbeStatus::Succeeded
        }
        Some(ProbeAttempt::Completed(payload)) => match probe_status(payload) {
            "timed-out" => LauncherModConfigProbeStatus::TimedOut,
            "failed" => LauncherModConfigProbeStatus::Failed,
            _ if !payload.process_succeeded => LauncherModConfigProbeStatus::Failed,
            _ if gmcm_detected == Some(true) => LauncherModConfigProbeStatus::Unavailable,
            _ => LauncherModConfigProbeStatus::NotRun,
        },
    }
}

pub(crate) fn merge_probe_fields(
    root: &Path,
    game_path: Option<&Path>,
    configured_mods_root: Option<&Path>,
    current_config: &Map<String, Value>,
    fields: &mut Vec<LauncherModConfigField>,
    warnings: &mut Vec<String>,
) -> (LauncherModConfigProbeStatus, Option<Value>) {
    if !mod_has_probe_dll(root) {
        return (LauncherModConfigProbeStatus::NotRun, None);
    }

    let Some(probe_assembly_path) = probe_assembly_path() else {
        warnings.push(
            "GMCM probe is not bundled yet; falling back to Content Patcher/config.json parsing."
                .to_string(),
        );
        return (LauncherModConfigProbeStatus::Unavailable, None);
    };

    let explicit_schema_keys = fields
        .iter()
        .map(|field| normalized_config_key(&field.key))
        .collect::<BTreeSet<_>>();
    let inspect_attempt = run_probe_mode(
        &probe_assembly_path,
        root,
        game_path,
        "inspect",
        GMCM_INSPECT_CHILD_TIMEOUT,
        GMCM_INSPECT_PARENT_TIMEOUT,
    );
    let inspect = match &inspect_attempt {
        ProbeAttempt::Completed(payload) => Some(payload),
        _ => None,
    };
    let inspect_detected = inspect.and_then(probe_gmcm_detected);
    let inspected_static_keys = inspect.map(probe_static_field_keys).unwrap_or_default();
    let schema_complete = !current_config.is_empty()
        && !explicit_schema_keys.is_empty()
        && current_config
            .keys()
            .all(|key| explicit_schema_keys.contains(&normalized_config_key(key)))
        && !inspected_static_keys.is_empty()
        && inspected_static_keys.is_subset(&explicit_schema_keys);
    let inspect_failed =
        inspect.is_some_and(|payload| matches!(probe_status(payload), "failed" | "timed-out"));
    let runtime_allowed = configured_mods_root
        .is_some_and(|mods_root| root != mods_root && root.starts_with(mods_root));
    let runtime_skip_reason = if !runtime_allowed {
        Some("outside-configured-mods-root")
    } else if inspect_detected == Some(true) {
        None
    } else if schema_complete {
        Some("schema-complete")
    } else if inspect_detected == Some(false) && !inspect_failed {
        Some("gmcm-not-detected")
    } else {
        None
    };
    let runtime_attempted = runtime_skip_reason.is_none();
    let runtime_attempt = runtime_attempted.then(|| {
        run_probe_mode(
            &probe_assembly_path,
            root,
            game_path,
            "runtime",
            GMCM_RUNTIME_CHILD_TIMEOUT,
            GMCM_RUNTIME_PARENT_TIMEOUT,
        )
    });
    let runtime = runtime_attempt.as_ref().and_then(|attempt| match attempt {
        ProbeAttempt::Completed(payload) => Some(payload),
        _ => None,
    });
    let runtime_detected = runtime.and_then(probe_gmcm_detected);
    let gmcm_detected = if runtime_detected == Some(true) || inspect_detected == Some(true) {
        Some(true)
    } else {
        runtime_detected.or(inspect_detected)
    };

    let runtime_has_authoritative_gmcm = runtime.is_some_and(|payload| {
        probe_gmcm_field_count(payload) > 0
            && payload.process_succeeded
            && probe_status(payload) == "succeeded"
    });

    // Runtime fields are merged first so real GMCM metadata wins over inspect's static shape.
    // A successful runtime capture also suppresses inspect-only static members, whose CLR names
    // may differ from the serialized GMCM storage keys. Config-only values are added below as the
    // config.json fallback instead of showing duplicate controls.
    if let Some(runtime) = runtime {
        merge_probe_payload_fields(runtime, current_config, fields, true);
    }
    if let Some(inspect) = inspect {
        merge_probe_payload_fields(
            inspect,
            current_config,
            fields,
            !runtime_has_authoritative_gmcm,
        );
    }

    let runtime_gmcm_fields = runtime.map(probe_gmcm_field_count).unwrap_or(0);
    let status = launcher_probe_status(runtime_attempted, runtime_attempt.as_ref(), gmcm_detected);

    let failure_stage = if status == LauncherModConfigProbeStatus::Succeeded {
        None
    } else {
        match runtime_attempt.as_ref() {
            Some(ProbeAttempt::TimedOut { .. }) => Some("runtime-timeout"),
            Some(ProbeAttempt::Failed { .. }) => Some("runtime-launch"),
            Some(ProbeAttempt::Completed(payload))
                if matches!(probe_status(payload), "failed" | "timed-out") =>
            {
                Some("runtime")
            }
            _ => match &inspect_attempt {
                ProbeAttempt::TimedOut { .. } => Some("inspect-timeout"),
                ProbeAttempt::Failed { .. } => Some("inspect-launch"),
                ProbeAttempt::Completed(payload)
                    if matches!(probe_status(payload), "failed" | "timed-out") =>
                {
                    Some("inspect")
                }
                _ => None,
            },
        }
    };

    if status == LauncherModConfigProbeStatus::Succeeded {
        if let Some(runtime) = runtime {
            push_unique_warnings(warnings, probe_warning_messages(runtime, "runtime"));
        }
    } else if runtime_attempted {
        match &inspect_attempt {
            ProbeAttempt::Completed(payload) => {
                push_unique_warnings(warnings, probe_warning_messages(payload, "inspect"));
            }
            ProbeAttempt::TimedOut { .. } => {
                push_unique_warnings(warnings, ["GMCM inspect probe timed out.".to_string()])
            }
            ProbeAttempt::Failed { message, .. } => {
                push_unique_warnings(warnings, [message.clone()]);
            }
        }
        if let Some(runtime_attempt) = runtime_attempt.as_ref() {
            match runtime_attempt {
                ProbeAttempt::Completed(payload) => {
                    push_unique_warnings(warnings, probe_warning_messages(payload, "runtime"));
                }
                ProbeAttempt::TimedOut { .. } => {
                    push_unique_warnings(warnings, ["GMCM runtime probe timed out.".to_string()])
                }
                ProbeAttempt::Failed { message, .. } => {
                    push_unique_warnings(warnings, [message.clone()]);
                }
            }
        }
    } else {
        match &inspect_attempt {
            ProbeAttempt::Completed(payload) => {
                push_unique_warnings(warnings, probe_warning_messages(payload, "inspect"));
            }
            ProbeAttempt::TimedOut { .. } => {
                push_unique_warnings(warnings, ["GMCM inspect probe timed out.".to_string()]);
            }
            ProbeAttempt::Failed { message, .. } => {
                push_unique_warnings(warnings, [message.clone()]);
            }
        }
    }

    let inspect_duration_ms = match &inspect_attempt {
        ProbeAttempt::Completed(payload) => payload.duration_ms,
        ProbeAttempt::TimedOut { duration_ms } | ProbeAttempt::Failed { duration_ms, .. } => {
            *duration_ms
        }
    };
    let runtime_duration_ms = match runtime_attempt.as_ref() {
        Some(ProbeAttempt::Completed(payload)) => payload.duration_ms,
        Some(ProbeAttempt::TimedOut { duration_ms })
        | Some(ProbeAttempt::Failed { duration_ms, .. }) => *duration_ms,
        None => 0,
    };
    let mut diagnostics = merged_probe_diagnostics(
        inspect,
        runtime,
        gmcm_detected,
        runtime_attempted,
        runtime_skip_reason,
        failure_stage,
        status == LauncherModConfigProbeStatus::Succeeded,
    );
    if let Some(diagnostics) = diagnostics.as_object_mut() {
        if let Some(mods_root) = configured_mods_root {
            diagnostics.insert(
                "configuredModsRoot".to_string(),
                Value::String(normalize_path(mods_root)),
            );
        }
        diagnostics.insert(
            "inspectDurationMs".to_string(),
            Value::from(inspect_duration_ms),
        );
        diagnostics.insert(
            "runtimeDurationMs".to_string(),
            Value::from(runtime_duration_ms),
        );
        diagnostics.insert(
            "durationMs".to_string(),
            Value::from(inspect_duration_ms.saturating_add(runtime_duration_ms)),
        );
        diagnostics.insert(
            "gmcmFieldsCaptured".to_string(),
            Value::from(runtime_gmcm_fields),
        );
        let static_fields = inspect
            .map(probe_static_field_count)
            .unwrap_or(0)
            .max(runtime.map(probe_static_field_count).unwrap_or(0));
        diagnostics.insert(
            "staticFieldsCaptured".to_string(),
            Value::from(static_fields),
        );
    }

    (status, Some(diagnostics))
}

pub(crate) struct ConfiguredProbePaths {
    pub(crate) game_path: Option<PathBuf>,
    pub(crate) mods_root: Option<PathBuf>,
}

fn canonical_existing_directory(path: PathBuf) -> Option<PathBuf> {
    path.canonicalize().ok().filter(|path| path.is_dir())
}

pub(crate) fn configured_probe_paths() -> ConfiguredProbePaths {
    let game_override = std::env::var_os("MODFORGE_GMCM_PROBE_GAME_PATH")
        .map(PathBuf::from)
        .and_then(canonical_existing_directory);
    let mods_override = std::env::var_os("MODFORGE_GMCM_PROBE_MODS_PATH")
        .map(PathBuf::from)
        .and_then(canonical_existing_directory);
    let settings = (game_override.is_none() || mods_override.is_none())
        .then(|| {
            launcher_settings_path()
                .ok()
                .and_then(|path| load_or_create_settings_at_path(&path).ok())
        })
        .flatten();
    let game_path = game_override.or_else(|| {
        settings
            .as_ref()
            .and_then(|settings| settings.game_path.as_deref())
            .map(clean_input_path)
            .and_then(canonical_existing_directory)
    });
    let mods_root = mods_override
        .or_else(|| {
            settings
                .as_ref()
                .and_then(|settings| settings.mods_path.as_deref())
                .map(clean_input_path)
                .and_then(canonical_existing_directory)
        })
        .or_else(|| {
            game_path
                .as_ref()
                .map(|game_path| game_path.join("Mods"))
                .and_then(canonical_existing_directory)
        });
    ConfiguredProbePaths {
        game_path,
        mods_root,
    }
}
