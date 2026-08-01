use super::types::{
    ChangeRegistry, ChangeRegistryPatch, CpMakerDependency, CpMakerDraftRecord, CpMakerI18nFile,
    CpMakerMetadata, CustomLocation, DynamicToken,
};
use crate::infrastructure::game_formats::json_relaxed::parse_json_str;
use crate::infrastructure::text_encoding::read_text_file;
use anyhow::{Context, bail};
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Import a CP mod directory into a draft record.
///
/// Reads `manifest.json` and `content.json`, recursively resolves all
/// `Action: "Include"` entries, then groups changes into patches.
///
/// * Include files under `changes/{workspace}.json` assign `{workspace}`
///   as the patch workspace.
/// * Inline changes (not from an include) get workspace `"mods"`.
/// * `EditData` changes targeting the same asset are merged into one patch.
/// * `EditImage` / `EditMap` / `Load` stay as standalone patches.
pub fn import_cp_maker_pack(mod_directory_path: &str) -> anyhow::Result<CpMakerDraftRecord> {
    let dir = Path::new(mod_directory_path);

    let manifest_path = dir.join("manifest.json");
    let manifest_json = read_text_file(&manifest_path).with_context(|| {
        format!(
            "Failed to read manifest.json [path={}]",
            manifest_path.to_string_lossy()
        )
    })?;
    let (metadata, config_schema_from_manifest) = parse_manifest_json(&manifest_json)?;

    let content_path = dir.join("content.json");
    let content_json = read_text_file(&content_path).with_context(|| {
        format!(
            "Failed to read content.json [path={}]",
            content_path.to_string_lossy()
        )
    })?;
    let (registry, dynamic_tokens, custom_locations, alias_token_names, config_schema_from_content) =
        parse_content_json(&content_json, dir)?;

    // Prefer ConfigSchema from manifest (CP canonical location), fallback to content.json
    let config_schema_draft = if config_schema_from_manifest
        .as_object()
        .map_or(false, |o| !o.is_empty())
    {
        config_schema_from_manifest
    } else {
        config_schema_from_content
    };

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let draft_storage_key = format!("imported-{timestamp}");
    let i18n_files = read_i18n_files(dir)?;

    Ok(CpMakerDraftRecord {
        draft_storage_key,
        project_metadata: metadata,
        config_schema_draft,
        serialized_change_registry: serde_json::to_value(registry)
            .context("Failed to serialize change registry")?,
        dynamic_tokens,
        custom_locations,
        alias_token_names,
        event_source_snapshots_by_target: BTreeMap::new(),
        i18n_files,
        project_assets: Vec::new(),
        last_draft_saved_at: None,
        last_exported_at: None,
        last_export_path: None,
        last_export_fingerprint: None,
    })
}

fn read_i18n_files(project_dir: &Path) -> anyhow::Result<Vec<CpMakerI18nFile>> {
    let i18n_dir = project_dir.join("i18n");
    if !i18n_dir.exists() {
        return Ok(Vec::new());
    }
    if !i18n_dir.is_dir() {
        bail!(
            "Content pack i18n path must be a directory [path={}]",
            i18n_dir.display()
        );
    }
    let mut files = Vec::new();
    for entry in fs::read_dir(&i18n_dir).with_context(|| {
        format!(
            "Failed to read i18n directory [path={}]",
            i18n_dir.display()
        )
    })? {
        let entry = entry
            .with_context(|| format!("Failed to read i18n entry [path={}]", i18n_dir.display()))?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let locale = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        validate_i18n_locale(&locale)?;
        let raw_json = read_text_file(&path)
            .with_context(|| format!("Failed to read i18n file [path={}]", path.display()))?;
        let value = parse_json_str(&raw_json, &format!("i18n/{locale}.json"))?;
        if !value.is_object() {
            bail!("i18n/{locale}.json must contain a JSON object");
        }
        files.push(CpMakerI18nFile { locale, raw_json });
    }
    files.sort_by(|left, right| left.locale.cmp(&right.locale));
    Ok(files)
}

pub(super) fn validate_i18n_locale(locale: &str) -> anyhow::Result<()> {
    let locale = locale.trim();
    if locale.is_empty()
        || !locale
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
    {
        bail!("i18n locale must be a safe file name [locale={locale}]");
    }
    Ok(())
}

// ─── manifest.json ────────────────────────────────────────────────────

fn parse_manifest_json(manifest_json: &str) -> anyhow::Result<(CpMakerMetadata, Value)> {
    let value = parse_json_str(manifest_json, "manifest.json")?;

    let obj = value
        .as_object()
        .context("manifest.json must be a JSON object")?;

    let get_string = |key: &str| -> anyhow::Result<String> {
        obj.get(key)
            .and_then(Value::as_str)
            .map(|s| s.to_string())
            .with_context(|| format!("manifest.json missing required field: {key}"))
    };

    let name = get_string("Name")?;
    let author = get_string("Author")?;
    let version = get_string("Version")?;
    let description = obj
        .get("Description")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let unique_id = get_string("UniqueID")?;

    let content_pack_for_object = obj.get("ContentPackFor").and_then(|v| v.as_object());
    let content_pack_for = content_pack_for_object
        .and_then(|o| o.get("UniqueID"))
        .and_then(Value::as_str)
        .unwrap_or("Pathoschild.ContentPatcher")
        .to_string();
    let content_pack_for_minimum_version = content_pack_for_object
        .and_then(|o| o.get("MinimumVersion"))
        .and_then(Value::as_str)
        .map(|s| s.to_string());

    let dependencies = obj
        .get("Dependencies")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_object)
                .filter_map(|entry| {
                    let unique_id = entry.get("UniqueID").and_then(Value::as_str)?;
                    Some(CpMakerDependency {
                        unique_id: unique_id.to_string(),
                        minimum_version: entry
                            .get("MinimumVersion")
                            .and_then(Value::as_str)
                            .map(|s| s.to_string()),
                        // SMAPI defaults a dependency to required when the key is absent.
                        is_required: entry
                            .get("IsRequired")
                            .and_then(Value::as_bool)
                            .unwrap_or(true),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let minimum_api_version = obj
        .get("MinimumApiVersion")
        .and_then(Value::as_str)
        .map(|s| s.to_string());
    let update_keys = obj
        .get("UpdateKeys")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default();

    let config_schema = obj
        .get("ConfigSchema")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));

    Ok((
        CpMakerMetadata {
            project_name: name,
            project_description: description,
            project_author: author,
            project_version: version,
            project_unique_id: unique_id,
            game_root_path: None,
            content_pack_for_unique_id: content_pack_for,
            content_pack_for_minimum_version,
            minimum_api_version,
            update_keys,
            dependencies,
        },
        config_schema,
    ))
}

// ─── content.json ─────────────────────────────────────────────────────

fn parse_content_json(
    content_json: &str,
    mod_dir: &Path,
) -> anyhow::Result<(
    ChangeRegistry,
    Vec<DynamicToken>,
    Vec<CustomLocation>,
    BTreeMap<String, String>,
    Value,
)> {
    let value = parse_json_str(content_json, "content.json")?;

    let obj = value
        .as_object()
        .context("content.json must be a JSON object")?;

    let mut visited = HashSet::new();
    let changes = resolve_changes(obj, mod_dir, &mut visited)?;

    let dynamic_tokens = parse_dynamic_tokens(obj.get("DynamicTokens"))?;
    let custom_locations = parse_custom_locations(obj.get("CustomLocations"))?;
    let alias_token_names = parse_alias_token_names(obj.get("AliasTokenNames"))?;
    let config_schema = obj
        .get("ConfigSchema")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));

    let patches = changes_to_patches(changes)?;
    let registry = ChangeRegistry { patches };

    Ok((
        registry,
        dynamic_tokens,
        custom_locations,
        alias_token_names,
        config_schema,
    ))
}

// ─── Include resolution ───────────────────────────────────────────────

/// Resolve Changes from a content object, recursively following Include actions.
///
/// Returns a list of `(workspace, change_value)`.  Workspace is inferred from
/// the include file path (`changes/{ws}.json`) or `"mods"` for inline changes.
fn resolve_changes(
    content_obj: &Map<String, Value>,
    mod_dir: &Path,
    visited: &mut HashSet<String>,
) -> anyhow::Result<Vec<(String, Value)>> {
    let mut result = Vec::new();

    let changes = content_obj
        .get("Changes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for change in changes {
        let change_obj = change
            .as_object()
            .context("Each change must be a JSON object")?;

        let action = change_obj
            .get("Action")
            .and_then(Value::as_str)
            .unwrap_or("");

        if action == "Include" {
            let from_files = parse_include_paths(
                change_obj
                    .get("FromFile")
                    .context("Include action must have FromFile")?,
            )?;
            for from_file in from_files {
                if from_file.contains("{{") {
                    result.push(("mods".to_string(), change.clone()));
                    continue;
                }
                let include_path = resolve_include_path(mod_dir, &from_file)?;
                let include_key = from_file.replace('\\', "/").to_ascii_lowercase();
                if !visited.insert(include_key.clone()) {
                    bail!("Cyclic include detected: {from_file}");
                }
                let nested_result = (|| {
                    let include_json = read_text_file(&include_path).with_context(|| {
                        format!(
                            "Failed to read include file {from_file} [path={}]",
                            include_path.to_string_lossy()
                        )
                    })?;
                    let include_value =
                        parse_json_str(&include_json, &format!("Include file {from_file}"))?;
                    let include_obj = include_value.as_object().with_context(|| {
                        format!("Include file {from_file} must be a JSON object")
                    })?;
                    let workspace = extract_workspace_from_include_path(&from_file);
                    let nested = resolve_changes(include_obj, mod_dir, visited)?;
                    Ok::<_, anyhow::Error>(
                        nested
                            .into_iter()
                            .map(|(nested_ws, change)| {
                                let effective = if nested_ws == "mods" {
                                    workspace.clone()
                                } else {
                                    nested_ws
                                };
                                (effective, change)
                            })
                            .collect::<Vec<_>>(),
                    )
                })();
                visited.remove(&include_key);
                result.extend(nested_result?);
            }
        } else {
            result.push(("mods".to_string(), change.clone()));
        }
    }

    Ok(result)
}

fn parse_include_paths(value: &Value) -> anyhow::Result<Vec<String>> {
    let values = match value {
        Value::String(value) => vec![value.as_str()],
        Value::Array(values) => values
            .iter()
            .map(|value| {
                value
                    .as_str()
                    .context("Include FromFile arrays may only contain strings")
            })
            .collect::<anyhow::Result<Vec<_>>>()?,
        _ => bail!("Include FromFile must be a string or string array"),
    };
    let paths = values
        .into_iter()
        .flat_map(|value| value.split(','))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    if paths.is_empty() {
        bail!("Include FromFile must contain at least one path");
    }
    Ok(paths)
}

fn resolve_include_path(mod_dir: &Path, raw: &str) -> anyhow::Result<PathBuf> {
    let relative = PathBuf::from(raw.replace('/', "\\"));
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        bail!("Include path must stay inside the content pack: {raw}");
    }
    Ok(mod_dir.join(relative))
}

fn extract_workspace_from_include_path(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("mods")
        .to_string()
}

// ─── Changes → Patches ────────────────────────────────────────────────

fn changes_to_patches(changes: Vec<(String, Value)>) -> anyhow::Result<Vec<ChangeRegistryPatch>> {
    // Group EditData by (workspace, target)
    let mut edit_data_groups: BTreeMap<(String, String), Vec<Value>> = BTreeMap::new();
    let mut standalone: Vec<(String, Value)> = Vec::new();

    for (workspace, change) in changes {
        let action = change
            .as_object()
            .and_then(|o| o.get("Action"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_lowercase();
        let target = change
            .as_object()
            .and_then(|o| o.get("Target"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        if action == "editdata" {
            edit_data_groups
                .entry((workspace, target))
                .or_default()
                .push(change);
        } else {
            standalone.push((workspace, change));
        }
    }

    let mut patches = Vec::new();
    let mut patch_id: u64 = 0;

    for ((workspace, target), changes) in edit_data_groups {
        patch_id += 1;
        patches.push(edit_data_changes_to_patch(
            &workspace, &target, &changes, patch_id,
        )?);
    }

    for (workspace, change) in standalone {
        patch_id += 1;
        patches.push(standalone_change_to_patch(&workspace, &change, patch_id)?);
    }

    Ok(patches)
}

fn edit_data_changes_to_patch(
    workspace: &str,
    target: &str,
    changes: &[Value],
    patch_id: u64,
) -> anyhow::Result<ChangeRegistryPatch> {
    let first = changes.first().and_then(|c| c.as_object());

    let log_name = first
        .and_then(|o| o.get("LogName"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let enabled = first
        .and_then(|o| o.get("Enabled"))
        .cloned()
        .unwrap_or(json!(true));
    let when = first.and_then(|o| o.get("When")).cloned();
    let target_locale = first
        .and_then(|o| o.get("TargetLocale"))
        .and_then(Value::as_str)
        .map(|s| s.to_string());
    let update = first
        .and_then(|o| o.get("Update"))
        .and_then(Value::as_str)
        .map(|s| s.to_string());
    let priority = first.and_then(|o| o.get("Priority")).cloned();
    let local_tokens = first.and_then(|o| o.get("LocalTokens")).cloned();
    let target_field = first
        .and_then(|o| o.get("TargetField"))
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(|s| s.to_string())
                .collect()
        });

    let mut entries = Map::new();
    let mut fields = Map::new();
    let mut text_operations = Vec::new();
    let mut move_entries = Vec::new();

    for change in changes {
        if let Some(obj) = change.as_object() {
            if let Some(e) = obj.get("Entries").and_then(Value::as_object) {
                for (k, v) in e {
                    entries.insert(k.clone(), v.clone());
                }
            }
            if let Some(f) = obj.get("Fields").and_then(Value::as_object) {
                for (entry_key, field_map) in f {
                    if let Some(field_obj) = field_map.as_object() {
                        let existing = fields
                            .entry(entry_key.clone())
                            .or_insert_with(|| Value::Object(Map::new()))
                            .as_object_mut();
                        if let Some(existing_map) = existing {
                            for (field_name, field_value) in field_obj {
                                existing_map.insert(field_name.clone(), field_value.clone());
                            }
                        }
                    }
                }
            }
            if let Some(ops) = obj.get("TextOperations").and_then(Value::as_array) {
                text_operations.extend(ops.iter().cloned());
            }
            if let Some(moves) = obj.get("MoveEntries").and_then(Value::as_array) {
                move_entries.extend(moves.iter().cloned());
            }
        }
    }

    let mut editor_state = Map::new();
    if !entries.is_empty() {
        editor_state.insert("entries".to_string(), Value::Object(entries));
    }
    if !fields.is_empty() {
        editor_state.insert("fields".to_string(), Value::Object(fields));
    }
    if !text_operations.is_empty() {
        editor_state.insert("textOperations".to_string(), Value::Array(text_operations));
    }
    if !move_entries.is_empty() {
        editor_state.insert("moveEntries".to_string(), Value::Array(move_entries));
    }

    Ok(ChangeRegistryPatch {
        id: format!("patch-{patch_id}"),
        workspace: workspace.to_string(),
        target: target.to_string(),
        action: "EditData".to_string(),
        log_name,
        enabled,
        when,
        from_file: None,
        editor_state: Value::Object(editor_state),
        target_locale,
        update,
        priority,
        local_tokens,
        target_field,
    })
}

fn standalone_change_to_patch(
    workspace: &str,
    change: &Value,
    patch_id: u64,
) -> anyhow::Result<ChangeRegistryPatch> {
    let obj = change.as_object().context("Change must be a JSON object")?;

    let action = obj
        .get("Action")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let target = obj
        .get("Target")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let log_name = obj
        .get("LogName")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let enabled = obj.get("Enabled").cloned().unwrap_or(json!(true));
    let when = obj.get("When").cloned();
    let from_file = obj
        .get("FromFile")
        .and_then(Value::as_str)
        .map(|s| s.to_string());
    let target_locale = obj
        .get("TargetLocale")
        .and_then(Value::as_str)
        .map(|s| s.to_string());
    let update = obj
        .get("Update")
        .and_then(Value::as_str)
        .map(|s| s.to_string());
    let priority = obj.get("Priority").cloned();
    let local_tokens = obj.get("LocalTokens").cloned();
    let target_field = obj.get("TargetField").and_then(Value::as_array).map(|arr| {
        arr.iter()
            .filter_map(Value::as_str)
            .map(|s| s.to_string())
            .collect()
    });

    let mut editor_state = Map::new();

    // Common CP field names that should NOT go into editor_state (they are PatchConfig)
    let common_keys: [&str; 11] = [
        "Action",
        "Target",
        "LogName",
        "Enabled",
        "When",
        "FromFile",
        "TargetLocale",
        "Update",
        "Priority",
        "LocalTokens",
        "TargetField",
    ];

    for (k, v) in obj {
        if common_keys.contains(&k.as_str()) {
            continue;
        }

        let internal_key = match k.as_str() {
            "MapProperties" => "properties",
            "AddWarps" => "warps",
            "AddNpcWarps" => "npcWarps",
            "MapTiles" => "mapTiles",
            "FromArea" => "fromArea",
            "ToArea" => "toArea",
            "PatchMode" => "patchMode",
            "TextOperations" => "textOperations",
            "MoveEntries" => "moveEntries",
            _ => k,
        };

        let mapped = if internal_key == "warps" || internal_key == "npcWarps" {
            let source_shape_key = if internal_key == "warps" {
                "warpsSourceShape"
            } else {
                "npcWarpsSourceShape"
            };
            let raw_key = if internal_key == "warps" {
                "rawWarps"
            } else {
                "rawNpcWarps"
            };
            let (shape, values) = match v {
                Value::String(value) => ("string", vec![Value::String(value.clone())]),
                Value::Array(values) => ("array", values.clone()),
                _ => ("raw", Vec::new()),
            };
            editor_state.insert(source_shape_key.to_string(), json!(shape));
            if shape == "raw" {
                editor_state.insert(raw_key.to_string(), v.clone());
                Value::Array(Vec::new())
            } else {
                let mut structured = Vec::new();
                let mut raw = Vec::new();
                for value in values {
                    let Some(expression) = value.as_str() else {
                        raw.push(value);
                        continue;
                    };
                    let parts = expression.split_whitespace().collect::<Vec<_>>();
                    if parts.len() == 5 {
                        structured.push(json!({
                            "fromX": parts[0], "fromY": parts[1], "toMap": parts[2],
                            "toX": parts[3], "toY": parts[4], "rawExpression": expression,
                        }));
                    } else {
                        raw.push(Value::String(expression.to_string()));
                    }
                }
                if !raw.is_empty() {
                    editor_state.insert(raw_key.to_string(), Value::Array(raw));
                }
                Value::Array(structured)
            }
        } else if internal_key == "mapTiles" {
            v.as_array()
                .map(|arr| {
                    let mut mapped_tiles = Vec::new();
                    let mut raw_tiles = Vec::new();
                    for t in arr {
                        if let Some(t_obj) = t.as_object() {
                            if let (Some(layer), Some(pos)) = (
                                t_obj.get("Layer"),
                                t_obj.get("Position").and_then(Value::as_object),
                            ) {
                                let mut tile = Map::new();
                                tile.insert("_raw".to_string(), t.clone());
                                tile.insert("layer".to_string(), layer.clone());
                                tile.insert(
                                    "x".to_string(),
                                    pos.get("X").cloned().unwrap_or(json!(0)),
                                );
                                tile.insert(
                                    "y".to_string(),
                                    pos.get("Y").cloned().unwrap_or(json!(0)),
                                );
                                if let Some(ts) = t_obj.get("SetTilesheet") {
                                    tile.insert("setTilesheet".to_string(), ts.clone());
                                }
                                if let Some(si) = t_obj.get("SetIndex") {
                                    tile.insert("setIndex".to_string(), si.clone());
                                }
                                if let Some(r) = t_obj.get("Remove") {
                                    let remove = match r {
                                        Value::Bool(value) => *value,
                                        Value::String(value) => value.eq_ignore_ascii_case("true"),
                                        _ => false,
                                    };
                                    tile.insert("remove".to_string(), json!(remove));
                                }
                                if let Some(sp) = t_obj.get("SetProperties") {
                                    tile.insert("setProperties".to_string(), sp.clone());
                                }
                                mapped_tiles.push(Value::Object(tile));
                            } else {
                                raw_tiles.push(t.clone());
                            }
                        } else {
                            raw_tiles.push(t.clone());
                        }
                    }
                    if !raw_tiles.is_empty() {
                        editor_state.insert("rawMapTiles".to_string(), Value::Array(raw_tiles));
                    }
                    Value::Array(mapped_tiles)
                })
                .unwrap_or_else(|| v.clone())
        } else if internal_key == "fromArea" || internal_key == "toArea" {
            v.as_object()
                .map(|area_obj| {
                    let mut area = Map::new();
                    area.insert("_raw".to_string(), v.clone());
                    area.insert(
                        "x".to_string(),
                        area_obj.get("X").cloned().unwrap_or(json!(0)),
                    );
                    area.insert(
                        "y".to_string(),
                        area_obj.get("Y").cloned().unwrap_or(json!(0)),
                    );
                    area.insert(
                        "width".to_string(),
                        area_obj.get("Width").cloned().unwrap_or(json!(0)),
                    );
                    area.insert(
                        "height".to_string(),
                        area_obj.get("Height").cloned().unwrap_or(json!(0)),
                    );
                    Value::Object(area)
                })
                .unwrap_or_else(|| v.clone())
        } else if internal_key == "textOperations" {
            v.as_array()
                .map(|arr| {
                    Value::Array(
                        arr.iter()
                            .filter_map(|op| {
                                let op_obj = op.as_object()?;
                                let mut result = Map::new();
                                for (k2, v2) in op_obj {
                                    let camel = match k2.as_str() {
                                        "Operation" => "operation",
                                        "Target" => "target",
                                        "Value" => "value",
                                        "Delimiter" => "delimiter",
                                        "Search" => "search",
                                        "ReplaceMode" => "replaceMode",
                                        _ => k2,
                                    };
                                    result.insert(camel.to_string(), v2.clone());
                                }
                                Some(Value::Object(result))
                            })
                            .collect(),
                    )
                })
                .unwrap_or_else(|| v.clone())
        } else if internal_key == "moveEntries" {
            v.as_array()
                .map(|arr| {
                    Value::Array(
                        arr.iter()
                            .filter_map(|entry| {
                                let entry_obj = entry.as_object()?;
                                let mut result = Map::new();
                                for (k2, v2) in entry_obj {
                                    let camel = match k2.as_str() {
                                        "ID" => "id",
                                        "BeforeId" => "beforeId",
                                        "AfterId" => "afterId",
                                        "ToPosition" => "toPosition",
                                        _ => k2,
                                    };
                                    result.insert(camel.to_string(), v2.clone());
                                }
                                Some(Value::Object(result))
                            })
                            .collect(),
                    )
                })
                .unwrap_or_else(|| v.clone())
        } else {
            v.clone()
        };

        editor_state.insert(internal_key.to_string(), mapped);
    }

    Ok(ChangeRegistryPatch {
        id: format!("patch-{patch_id}"),
        workspace: workspace.to_string(),
        target,
        action,
        log_name,
        enabled,
        when,
        from_file,
        editor_state: Value::Object(editor_state),
        target_locale,
        update,
        priority,
        local_tokens,
        target_field,
    })
}

// ─── Root-level parsers ───────────────────────────────────────────────

fn parse_dynamic_tokens(value: Option<&Value>) -> anyhow::Result<Vec<DynamicToken>> {
    let mut result = Vec::new();
    if let Some(arr) = value.and_then(Value::as_array) {
        for token in arr {
            if let Some(obj) = token.as_object() {
                result.push(DynamicToken {
                    name: obj
                        .get("Name")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    value: obj
                        .get("Value")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    when: obj.get("When").and_then(Value::as_object).cloned(),
                });
            }
        }
    }
    Ok(result)
}

fn parse_custom_locations(value: Option<&Value>) -> anyhow::Result<Vec<CustomLocation>> {
    let mut result = Vec::new();
    if let Some(arr) = value.and_then(Value::as_array) {
        for loc in arr {
            if let Some(obj) = loc.as_object() {
                result.push(CustomLocation {
                    name: obj
                        .get("Name")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    from_map_file: obj
                        .get("FromMapFile")
                        .and_then(Value::as_str)
                        .map(|s| s.to_string()),
                    migrate_legacy_names: obj
                        .get("MigrateLegacyNames")
                        .and_then(Value::as_array)
                        .map(|arr| {
                            arr.iter()
                                .filter_map(Value::as_str)
                                .map(|s| s.to_string())
                                .collect()
                        })
                        .unwrap_or_default(),
                });
            }
        }
    }
    Ok(result)
}

fn parse_alias_token_names(value: Option<&Value>) -> anyhow::Result<BTreeMap<String, String>> {
    let mut result = BTreeMap::new();
    if let Some(obj) = value.and_then(Value::as_object) {
        for (k, v) in obj {
            if let Some(s) = v.as_str() {
                result.insert(k.clone(), s.to_string());
            }
        }
    }
    Ok(result)
}

// ─── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
#[path = "../../tests/unit/domain/cp_maker/builder_tests.rs"]
mod tests;
