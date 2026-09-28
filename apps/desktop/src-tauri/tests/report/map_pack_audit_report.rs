use anyhow::{Context, bail};
use modforge_studio_desktop_lib::map_validation;
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActionCounts {
    total: usize,
    applied: usize,
    skipped: usize,
    indeterminate: usize,
    error: usize,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct FormatCounts {
    found: usize,
    loaded: usize,
    failed: usize,
    non_map: usize,
    round_trip_equal: usize,
    round_trip_changed: usize,
    round_trip_unsupported: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditIssue {
    path: String,
    stage: &'static str,
    message: String,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct TimingSummary {
    import_ms: u128,
    parse_ms: u128,
    round_trip_ms: u128,
    total_asset_bytes: u64,
    peak_asset_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SampleReport {
    name: String,
    content_packs: Vec<String>,
    source_map_actions: usize,
    source_map_action_types: BTreeMap<String, usize>,
    map_actions: ActionCounts,
    map_action_types: BTreeMap<String, usize>,
    effective_action_delta: i64,
    unresolved_includes: Vec<String>,
    repeated_includes: Vec<String>,
    source_scan_unreadable: Vec<String>,
    formats: BTreeMap<String, FormatCounts>,
    tokenized_contexts: Vec<String>,
    missing_dependencies: Vec<String>,
    issues: Vec<AuditIssue>,
    timings: TimingSummary,
}

fn walk_files(root: &Path) -> anyhow::Result<Vec<PathBuf>> {
    fn visit(path: &Path, files: &mut Vec<PathBuf>) -> anyhow::Result<()> {
        for entry in fs::read_dir(path)
            .with_context(|| format!("Failed to enumerate `{}`", path.display()))?
        {
            let entry = entry?;
            let file_type = entry.file_type()?;
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                visit(&entry.path(), files)?;
            } else if file_type.is_file() {
                files.push(entry.path());
            }
        }
        Ok(())
    }

    let mut files = Vec::new();
    visit(root, &mut files)?;
    files.sort();
    Ok(files)
}

fn value_text(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join(","),
        Some(value) => value.to_string(),
        None => String::new(),
    }
}

fn is_content_patcher_manifest(path: &Path) -> bool {
    map_validation::read_relaxed_json(path)
        .ok()
        .and_then(|manifest| {
            manifest
                .get("ContentPackFor")
                .and_then(|value| value.get("UniqueID"))
                .and_then(Value::as_str)
                .map(|value| value.eq_ignore_ascii_case("Pathoschild.ContentPatcher"))
        })
        .unwrap_or(false)
}

fn normalized_join(root: &Path, relative: &str) -> Option<PathBuf> {
    let mut result = root.to_path_buf();
    for segment in relative.replace('\\', "/").split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                if !result.pop() || !result.starts_with(root) {
                    return None;
                }
            }
            segment => result.push(segment),
        }
    }
    result.starts_with(root).then_some(result)
}

fn is_map_action(action: &str, target: &str, from_file: &str) -> bool {
    action.eq_ignore_ascii_case("EditMap")
        || (action.eq_ignore_ascii_case("Load")
            && (target.to_ascii_lowercase().contains("maps/")
                || [".tmx", ".tbin"]
                    .iter()
                    .any(|extension| from_file.to_ascii_lowercase().ends_with(extension))))
}

fn source_field<'a>(change: &'a Value, name: &str) -> Option<&'a Value> {
    change
        .get(name)
        .or_else(|| change.get(format!("{}{}", name[..1].to_ascii_lowercase(), &name[1..])))
}

fn include_paths(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::String(value)) => value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect(),
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .flat_map(|value| value.split(','))
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn audit_source_actions(
    pack_root: &Path,
    sample_root: &Path,
    action_types: &mut BTreeMap<String, usize>,
    include_counts: &mut BTreeMap<String, usize>,
    unreadable: &mut Vec<String>,
) -> usize {
    let mut total = 0;
    let Ok(files) = walk_files(pack_root) else {
        return total;
    };
    for path in files {
        if !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("json"))
        {
            continue;
        }
        let value = match map_validation::read_relaxed_json(&path) {
            Ok(value) => value,
            Err(error) => {
                unreadable.push(format!(
                    "{}: {error:#}",
                    path.strip_prefix(sample_root).unwrap_or(&path).display()
                ));
                continue;
            }
        };
        let Some(changes) = value.get("Changes").and_then(Value::as_array) else {
            continue;
        };
        for change in changes {
            let action = value_text(source_field(change, "Action"));
            let target = value_text(source_field(change, "Target"));
            let from_file = value_text(source_field(change, "FromFile"));
            if is_map_action(&action, &target, &from_file) {
                total += 1;
                *action_types.entry(action.clone()).or_default() += 1;
            }
            if action.eq_ignore_ascii_case("Include") {
                for include in include_paths(source_field(change, "FromFile")) {
                    let key = include.replace('\\', "/").to_ascii_lowercase();
                    *include_counts.entry(key).or_default() += 1;
                }
            }
        }
    }
    total
}

fn audit_actions(
    pack_root: &Path,
    draft: &Value,
    counts: &mut ActionCounts,
    action_types: &mut BTreeMap<String, usize>,
    unresolved_includes: &mut Vec<String>,
    tokenized: &mut Vec<String>,
    missing: &mut Vec<String>,
) {
    let patches = draft
        .get("serializedChangeRegistry")
        .and_then(|value| value.get("patches"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for (index, patch) in patches.iter().enumerate() {
        let action = value_text(patch.get("action"));
        let target = value_text(patch.get("target"));
        let from_file = value_text(patch.get("fromFile"));
        let context = format!(
            "{}#{} action={} target={} fromFile={}",
            pack_root.display(),
            index,
            action,
            target,
            from_file
        );
        if action.eq_ignore_ascii_case("Include") {
            unresolved_includes.push(context);
            continue;
        }
        let map_action = is_map_action(&action, &target, &from_file);
        if !map_action {
            continue;
        }
        counts.total += 1;
        *action_types.entry(action.clone()).or_default() += 1;
        if patch.get("enabled") == Some(&Value::Bool(false)) {
            counts.skipped += 1;
        } else if context.contains("{{") || !patch.get("when").is_none_or(Value::is_null) {
            counts.indeterminate += 1;
            tokenized.push(context);
        } else if !from_file.is_empty() {
            match normalized_join(pack_root, &from_file) {
                Some(path) if path.is_file() => counts.applied += 1,
                Some(path) => {
                    counts.error += 1;
                    missing.push(format!("{} -> {}", context, path.display()));
                }
                None => {
                    counts.error += 1;
                    missing.push(format!("{} -> path escapes content pack", context));
                }
            }
        } else {
            counts.applied += 1;
        }
    }
}

fn audit_sample(name: String, root: &Path) -> anyhow::Result<SampleReport> {
    let files = walk_files(root)?;
    let pack_roots = files
        .iter()
        .filter(|path| {
            path.file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("manifest.json"))
                && is_content_patcher_manifest(path)
        })
        .filter_map(|path| path.parent().map(Path::to_path_buf))
        .collect::<Vec<_>>();
    let mut report = SampleReport {
        name,
        content_packs: pack_roots
            .iter()
            .map(|path| {
                path.strip_prefix(root)
                    .unwrap_or(path)
                    .display()
                    .to_string()
            })
            .collect(),
        source_map_actions: 0,
        source_map_action_types: BTreeMap::new(),
        map_actions: ActionCounts::default(),
        map_action_types: BTreeMap::new(),
        effective_action_delta: 0,
        unresolved_includes: Vec::new(),
        repeated_includes: Vec::new(),
        source_scan_unreadable: Vec::new(),
        formats: BTreeMap::new(),
        tokenized_contexts: Vec::new(),
        missing_dependencies: Vec::new(),
        issues: Vec::new(),
        timings: TimingSummary::default(),
    };

    let mut include_counts = BTreeMap::new();
    for pack_root in &pack_roots {
        report.source_map_actions += audit_source_actions(
            pack_root,
            root,
            &mut report.source_map_action_types,
            &mut include_counts,
            &mut report.source_scan_unreadable,
        );
    }
    report.repeated_includes = include_counts
        .into_iter()
        .filter(|(_, count)| *count > 1)
        .map(|(path, count)| format!("{path} ({count} references)"))
        .collect();

    let import_started = Instant::now();
    for pack_root in &pack_roots {
        match map_validation::import_content_pack(pack_root) {
            Ok(draft) => audit_actions(
                pack_root,
                &draft,
                &mut report.map_actions,
                &mut report.map_action_types,
                &mut report.unresolved_includes,
                &mut report.tokenized_contexts,
                &mut report.missing_dependencies,
            ),
            Err(error) => report.issues.push(AuditIssue {
                path: pack_root.display().to_string(),
                stage: "import",
                message: format!("{error:#}"),
            }),
        }
    }
    report.timings.import_ms = import_started.elapsed().as_millis();
    report.effective_action_delta =
        report.map_actions.total as i64 - report.source_map_actions as i64;

    for path in files {
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !matches!(extension.as_str(), "tmx" | "tbin" | "xnb") {
            continue;
        }
        let relative = path.strip_prefix(root).unwrap_or(&path).to_string_lossy();
        let bytes = fs::metadata(&path).map(|value| value.len()).unwrap_or(0);
        report.timings.total_asset_bytes = report.timings.total_asset_bytes.saturating_add(bytes);
        report.timings.peak_asset_bytes = report.timings.peak_asset_bytes.max(bytes);
        let is_xnb = extension == "xnb";
        let format = report.formats.entry(extension).or_default();
        format.found += 1;
        if is_xnb {
            match map_validation::is_tbin_xnb(&path) {
                Ok(true) => {}
                Ok(false) => {
                    format.non_map += 1;
                    continue;
                }
                Err(error) => {
                    format.failed += 1;
                    report.issues.push(AuditIssue {
                        path: relative.to_string(),
                        stage: "classifyXnb",
                        message: format!("Failed to inspect XNB reader metadata: {error:#}"),
                    });
                    continue;
                }
            }
        }
        let parse_started = Instant::now();
        let parsed = map_validation::parse_map(&path, &relative);
        report.timings.parse_ms += parse_started.elapsed().as_millis();
        match parsed {
            Ok(document) => {
                format.loaded += 1;
                let round_trip_started = Instant::now();
                match map_validation::serialize_map(&document) {
                    Ok(Some(serialized)) => {
                        match map_validation::parse_map_bytes(&serialized, &path, &relative) {
                            Ok(round_tripped) if round_tripped == document => {
                                format.round_trip_equal += 1
                            }
                            Ok(_) => format.round_trip_changed += 1,
                            Err(error) => report.issues.push(AuditIssue {
                                path: relative.to_string(),
                                stage: "roundTripParse",
                                message: format!("{error:#}"),
                            }),
                        }
                    }
                    Ok(None) => format.round_trip_unsupported += 1,
                    Err(error) => report.issues.push(AuditIssue {
                        path: relative.to_string(),
                        stage: "serialize",
                        message: format!("{error:#}"),
                    }),
                }
                report.timings.round_trip_ms += round_trip_started.elapsed().as_millis();
            }
            Err(error) => {
                format.failed += 1;
                let message = format!("{error:#}");
                if message.to_ascii_lowercase().contains("not found")
                    || message.to_ascii_lowercase().contains("failed to read")
                {
                    report
                        .missing_dependencies
                        .push(format!("{} -> {}", relative, message));
                }
                report.issues.push(AuditIssue {
                    path: relative.to_string(),
                    stage: "parse",
                    message,
                });
            }
        }
    }

    report.tokenized_contexts.sort();
    report.tokenized_contexts.dedup();
    report.unresolved_includes.sort();
    report.unresolved_includes.dedup();
    report.source_scan_unreadable.sort();
    report.source_scan_unreadable.dedup();
    report.missing_dependencies.sort();
    report.missing_dependencies.dedup();
    Ok(report)
}

fn main() -> anyhow::Result<()> {
    let root = std::env::var_os("MODFORGE_MAP_SAMPLE_ROOT")
        .map(PathBuf::from)
        .context("MODFORGE_MAP_SAMPLE_ROOT must point to the extracted sample directory")?;
    if !root.is_dir() {
        bail!("Map sample root is not a directory: {}", root.display());
    }
    let mut samples = Vec::new();
    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            samples.push(audit_sample(
                entry.file_name().to_string_lossy().into_owned(),
                &entry.path(),
            )?);
        }
    }
    samples.sort_by(|left, right| left.name.cmp(&right.name));
    let output = serde_json::to_string_pretty(&samples)?;
    if let Some(path) = std::env::var_os("MODFORGE_MAP_AUDIT_OUTPUT").map(PathBuf::from) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, format!("{output}\n"))?;
        println!("Wrote map-pack audit report to {}", path.display());
    } else {
        println!("{output}");
    }
    Ok(())
}
