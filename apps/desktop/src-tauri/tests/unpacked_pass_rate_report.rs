#[path = "../src/tbin.rs"]
mod tbin;
#[path = "../src/pathing.rs"]
mod pathing;
#[path = "../src/xnb/mod.rs"]
mod xnb;

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use image::ImageFormat;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum AssetKind {
    TextJson,
    TexturePng,
    MapTmx,
    SpriteFont,
    BmFont,
    Unknown,
}

impl AssetKind {
    fn label(self) -> &'static str {
        match self {
            AssetKind::TextJson => "text-json",
            AssetKind::TexturePng => "texture-png",
            AssetKind::MapTmx => "map-tmx",
            AssetKind::SpriteFont => "spritefont",
            AssetKind::BmFont => "bmfont",
            AssetKind::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Default, Clone)]
struct Stats {
    total: usize,
    passed: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum FailureKind {
    UnsupportedReader,
    JsonMismatch,
    TextureMismatch,
    MapMismatch,
    ParseError,
}

impl FailureKind {
    fn label(&self) -> &'static str {
        match self {
            FailureKind::UnsupportedReader => "unsupported-reader",
            FailureKind::JsonMismatch => "json-mismatch",
            FailureKind::TextureMismatch => "texture-mismatch",
            FailureKind::MapMismatch => "map-mismatch",
            FailureKind::ParseError => "parse-error",
        }
    }
}

#[derive(Debug)]
struct AssetCase {
    xnb_path: PathBuf,
    relative_path: PathBuf,
    unpacked_base: PathBuf,
    kind: AssetKind,
}

#[derive(Debug, Clone)]
struct FailureRecord {
    failure_kind: FailureKind,
    error: String,
}

#[test]
fn compare_rust_unpack_pass_rate_against_content_unpacked() {
    let game_root = resolve_game_root();
    let content_root = game_root.join("Content");
    let unpacked_root = game_root.join("Content (unpacked)");

    assert!(content_root.exists(), "missing Content directory: {}", content_root.display());
    assert!(
        unpacked_root.exists(),
        "missing Content (unpacked) directory: {}",
        unpacked_root.display()
    );

    let mut cases = Vec::new();
    collect_xnb_cases(&content_root, &unpacked_root, &content_root, &mut cases)
        .unwrap_or_else(|error| panic!("failed to scan game content: {error}"));
    assert!(!cases.is_empty(), "no XNB files with unpacked counterparts were found");

    let mut per_kind: BTreeMap<AssetKind, Stats> = BTreeMap::new();
    let mut failure_breakdown: BTreeMap<(AssetKind, FailureKind), usize> = BTreeMap::new();
    let mut failure_details: BTreeMap<(AssetKind, FailureKind), Vec<String>> = BTreeMap::new();
    let mut failures = Vec::new();
    let mut overall = Stats::default();

    for case in &cases {
        let passed = match case.kind {
            AssetKind::TextJson => compare_text_json(case),
            AssetKind::TexturePng => compare_texture_png(case),
            AssetKind::MapTmx => compare_map_tmx(case),
            AssetKind::SpriteFont | AssetKind::BmFont | AssetKind::Unknown => compare_parse_only(case),
        };

        let stats = per_kind.entry(case.kind).or_default();
        stats.total += 1;
        overall.total += 1;

        match passed {
            Ok(()) => {
                stats.passed += 1;
                overall.passed += 1;
            }
            Err(error) => {
                let failure_kind = classify_failure(&error);
                *failure_breakdown.entry((case.kind, failure_kind.clone())).or_default() += 1;
                failures.push(FailureRecord {
                    failure_kind: failure_kind.clone(),
                    error: error.clone(),
                });
                failure_details
                    .entry((case.kind, failure_kind))
                    .or_default()
                    .push(format!("{} => {}", case.relative_path.display(), error));
            }
        }
    }

    let mut unsupported_group_counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut unsupported_reader_counts: BTreeMap<String, usize> = BTreeMap::new();
    for failure in &failures {
        if failure.failure_kind != FailureKind::UnsupportedReader {
            continue;
        }
        if let Some(reader) = extract_unsupported_reader(&failure.error) {
            *unsupported_reader_counts.entry(reader.clone()).or_default() += 1;
            *unsupported_group_counts
                .entry(classify_unsupported_reader_group(&reader))
                .or_default() += 1;
        }
    }

    let mut report = String::new();
    report.push_str("Rust XNB unpack pass-rate report against Content (unpacked)\n");
    report.push_str(&format!("Game root: {}\n", game_root.display()));
    report.push_str(&format!(
        "Overall: {}/{} ({:.2}%)\n",
        overall.passed,
        overall.total,
        percentage(overall.passed, overall.total)
    ));

    for (kind, stats) in &per_kind {
        report.push_str(&format!(
            "  {}: {}/{} ({:.2}%)\n",
            kind.label(),
            stats.passed,
            stats.total,
            percentage(stats.passed, stats.total)
        ));
    }

    if !failure_breakdown.is_empty() {
        report.push_str("Failure breakdown:\n");
        for ((asset_kind, failure_kind), count) in &failure_breakdown {
            report.push_str(&format!(
                "  {} / {}: {}\n",
                asset_kind.label(),
                failure_kind.label(),
                count
            ));
        }
    }

    if !unsupported_group_counts.is_empty() {
        report.push_str("Unsupported reader groups:\n");
        for (group, count) in &unsupported_group_counts {
            report.push_str(&format!("  {}: {}\n", group, count));
        }
    }

    if !unsupported_reader_counts.is_empty() {
        report.push_str("Unsupported reader types:\n");
        for (reader, count) in &unsupported_reader_counts {
            report.push_str(&format!("  {}: {}\n", reader, count));
        }
    }

    let mut failure_report = String::new();
    if !unsupported_group_counts.is_empty() {
        failure_report.push_str("[unsupported-reader-groups]\n");
        for (group, count) in &unsupported_group_counts {
            failure_report.push_str(&format!("{group}: {count}\n"));
        }
        failure_report.push('\n');
    }
    if !unsupported_reader_counts.is_empty() {
        failure_report.push_str("[unsupported-reader-types]\n");
        for (reader, count) in &unsupported_reader_counts {
            failure_report.push_str(&format!("{reader}: {count}\n"));
        }
        failure_report.push('\n');
    }
    if !failure_details.is_empty() {
        report.push_str("Sample failures:\n");
        for ((asset_kind, failure_kind), entries) in &failure_details {
            report.push_str(&format!(
                "  [{}:{}]\n",
                asset_kind.label(),
                failure_kind.label()
            ));
            failure_report.push_str(&format!(
                "[{}:{}]\n",
                asset_kind.label(),
                failure_kind.label()
            ));

            for entry in entries.iter().take(8) {
                report.push_str("    ");
                report.push_str(entry);
                report.push('\n');
            }

            for entry in entries {
                failure_report.push_str(entry);
                failure_report.push('\n');
            }
            failure_report.push('\n');
        }
    }

    let report_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("rust-unpack-pass-rate-report.txt");
    fs::write(&report_path, &report)
        .unwrap_or_else(|error| panic!("failed to write {}: {error}", report_path.display()));
    let failure_report_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("rust-unpack-pass-rate-failures.txt");
    fs::write(&failure_report_path, &failure_report)
        .unwrap_or_else(|error| panic!("failed to write {}: {error}", failure_report_path.display()));

    eprintln!("{report}");
    eprintln!("Report written to {}", report_path.display());
    eprintln!("Failure details written to {}", failure_report_path.display());
}

fn resolve_game_root() -> PathBuf {
    std::env::var_os("SDV_GAME_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"E:\SteamLibrary\steamapps\common\Stardew Valley"))
}

fn collect_xnb_cases(
    root: &Path,
    unpacked_root: &Path,
    current: &Path,
    cases: &mut Vec<AssetCase>,
) -> Result<(), String> {
    let entries = fs::read_dir(current)
        .map_err(|error| format!("failed to read {}: {error}", current.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("failed to inspect directory entry: {error}"))?;
        let path = entry.path();

        if path.is_dir() {
            collect_xnb_cases(root, unpacked_root, &path, cases)?;
            continue;
        }

        if !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("xnb"))
        {
            continue;
        }

        let relative_path = path
            .strip_prefix(root)
            .map_err(|error| format!("failed to strip content prefix from {}: {error}", path.display()))?
            .to_path_buf();
        let unpacked_base = unpacked_root.join(&relative_path);
        let kind = classify_unpacked_asset(&unpacked_base);
        if kind == AssetKind::Unknown {
            continue;
        }

        cases.push(AssetCase {
            xnb_path: path,
            relative_path,
            unpacked_base,
            kind,
        });
    }

    Ok(())
}

fn classify_unpacked_asset(unpacked_base: &Path) -> AssetKind {
    let has_json = unpacked_variant(unpacked_base, "json").exists();
    let has_png = unpacked_variant(unpacked_base, "png").exists();
    let has_tmx = unpacked_variant(unpacked_base, "tmx").exists();
    let has_fnt = unpacked_variant(unpacked_base, "fnt").exists();

    if has_tmx {
        AssetKind::MapTmx
    } else if has_fnt {
        AssetKind::BmFont
    } else if has_json && has_png {
        AssetKind::SpriteFont
    } else if has_json {
        AssetKind::TextJson
    } else if has_png {
        AssetKind::TexturePng
    } else {
        AssetKind::Unknown
    }
}

fn compare_text_json(case: &AssetCase) -> Result<(), String> {
    let expected_path = unpacked_variant(&case.unpacked_base, "json");
    let expected = parse_json_file(&expected_path)?;
    let actual = xnb::read_xnb_from_path(&case.xnb_path)
        .map_err(|error| format!("xnb parse failed: {error}"))?
        .content
        .to_json();

    if actual == expected {
        Ok(())
    } else {
        Err(format!("json mismatch against {}", expected_path.display()))
    }
}

fn compare_texture_png(case: &AssetCase) -> Result<(), String> {
    let expected_path = unpacked_variant(&case.unpacked_base, "png");
    let expected_png = fs::read(&expected_path)
        .map_err(|error| format!("failed to read {}: {error}", expected_path.display()))?;
    let expected = image::load_from_memory_with_format(&expected_png, ImageFormat::Png)
        .map_err(|error| format!("failed to decode {}: {error}", expected_path.display()))?
        .into_rgba8();

    let parsed = xnb::read_xnb_from_path(&case.xnb_path).map_err(|error| format!("xnb parse failed: {error}"))?;
    let texture = parsed
        .content
        .as_texture()
        .ok_or_else(|| "xnb content was not a Texture2D".to_string())?;

    if texture.width != expected.width() || texture.height != expected.height() {
        return Err(format!(
            "dimension mismatch: rust={}x{}, unpacked={}x{}",
            texture.width,
            texture.height,
            expected.width(),
            expected.height()
        ));
    }

    if texture.rgba != expected.into_raw() {
        return Err(format!("pixel mismatch against {}", expected_path.display()));
    }

    Ok(())
}

fn compare_map_tmx(case: &AssetCase) -> Result<(), String> {
    let expected_path = unpacked_variant(&case.unpacked_base, "tmx");
    let expected = parse_tmx_header(&expected_path)?;

    let parsed = xnb::read_xnb_from_path(&case.xnb_path).map_err(|error| format!("xnb parse failed: {error}"))?;
    let bytes = parsed
        .content
        .as_bytes()
        .ok_or_else(|| "xnb content was not TBin bytes".to_string())?;
    let map = tbin::parse_tbin_map(bytes, &case.xnb_path, &case.relative_path.to_string_lossy())
        .map_err(|error| format!("tbin parse failed: {error}"))?;

    if map.width != expected.width
        || map.height != expected.height
        || map.tile_width != expected.tile_width
        || map.tile_height != expected.tile_height
    {
        return Err(format!(
            "tmx header mismatch: rust={}x{} @ {}x{}, unpacked={}x{} @ {}x{}",
            map.width,
            map.height,
            map.tile_width,
            map.tile_height,
            expected.width,
            expected.height,
            expected.tile_width,
            expected.tile_height
        ));
    }

    Ok(())
}

fn compare_parse_only(case: &AssetCase) -> Result<(), String> {
    xnb::read_xnb_from_path(&case.xnb_path)
        .map(|_| ())
        .map_err(|error| format!("xnb parse failed: {error}"))
}

fn parse_json_file(path: &Path) -> Result<serde_json::Value, String> {
    let text = fs::read_to_string(path).map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    serde_json::from_str(&text).map_err(|error| format!("failed to parse {}: {error}", path.display()))
}

fn unpacked_variant(unpacked_base: &Path, ext: &str) -> PathBuf {
    let file_name = unpacked_base
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let stem = file_name.strip_suffix(".xnb").unwrap_or(file_name);
    unpacked_base.with_file_name(format!("{stem}.{ext}"))
}

#[derive(Debug, Clone, Copy)]
struct TmxHeader {
    width: u32,
    height: u32,
    tile_width: u32,
    tile_height: u32,
}

fn parse_tmx_header(path: &Path) -> Result<TmxHeader, String> {
    let text = fs::read_to_string(path).map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let map_tag = text
        .find("<map ")
        .and_then(|start| text[start..].find('>').map(|end| &text[start..start + end]))
        .ok_or_else(|| format!("failed to find <map> tag in {}", path.display()))?;

    Ok(TmxHeader {
        width: parse_xml_int_attribute(map_tag, "width")?,
        height: parse_xml_int_attribute(map_tag, "height")?,
        tile_width: parse_xml_int_attribute(map_tag, "tilewidth")?,
        tile_height: parse_xml_int_attribute(map_tag, "tileheight")?,
    })
}

fn parse_xml_int_attribute(tag: &str, name: &str) -> Result<u32, String> {
    let needle = format!("{name}=\"");
    let start = tag
        .find(&needle)
        .ok_or_else(|| format!("missing {name} attribute in {tag}"))?
        + needle.len();
    let end = tag[start..]
        .find('"')
        .ok_or_else(|| format!("unterminated {name} attribute in {tag}"))?
        + start;
    tag[start..end]
        .parse::<u32>()
        .map_err(|error| format!("invalid {name} attribute in {tag}: {error}"))
}

fn percentage(passed: usize, total: usize) -> f64 {
    if total == 0 {
        0.0
    } else {
        passed as f64 * 100.0 / total as f64
    }
}

fn classify_failure(error: &str) -> FailureKind {
    if error.contains("Unsupported XNB reader type") || error.contains("Unsupported simplified reader type") {
        FailureKind::UnsupportedReader
    } else if error.contains("json mismatch") {
        FailureKind::JsonMismatch
    } else if error.contains("pixel mismatch") || error.contains("dimension mismatch") {
        FailureKind::TextureMismatch
    } else if error.contains("tmx header mismatch") {
        FailureKind::MapMismatch
    } else {
        FailureKind::ParseError
    }
}

fn extract_unsupported_reader(error: &str) -> Option<String> {
    let prefix = "xnb parse failed: Unsupported XNB reader type: ";
    let rest = error.strip_prefix(prefix)?;
    let simplified = rest.split(" (").next()?.trim();
    if simplified != "Microsoft.Xna.Framework.Content.ReflectiveReader" {
        return Some(simplified.to_string());
    }

    let full = rest
        .split_once(" (")
        .map(|(_, suffix)| suffix.trim_end_matches(')'))
        .unwrap_or(rest);
    let nested = full.split("[[").nth(1)?;
    let type_name = nested.split(',').next()?.trim();
    Some(type_name.to_string())
}

fn classify_unsupported_reader_group(reader: &str) -> String {
    let prefix = "StardewValley.GameData.";
    if let Some(rest) = reader.strip_prefix(prefix) {
        let segment = rest.split('.').next().unwrap_or(rest);
        if segment == rest {
            "GameData.<root>".to_string()
        } else {
            format!("GameData.{segment}")
        }
    } else if reader.starts_with("StardewValley.") {
        "StardewValley.other".to_string()
    } else {
        "other".to_string()
    }
}
