//! Local SMAPI installer archive scanning.
//!
//! Scans the user's download directories (top level only) for SMAPI installer
//! archives they already downloaded manually and computes the
//! `compatible` / `satisfies_target` flags against the game-compatible maximum
//! and current target. Exposes [`find_smapi_installer_downloads_blocking`].

use super::installer::{SmapiInstallerFileKind, parse_smapi_installer_file_name};
use super::release::load_cached_latest_smapi_release;
use super::versioning::{SMAPI_LATEST_MINIMUM_GAME_VERSION, max_game_compatible_smapi_version};
use crate::domain::app_paths::{
    current_timestamp_ms, launcher_settings_path, launcher_smapi_update_cache_path,
};
use crate::domain::launcher::settings::load_or_create_settings_at_path;
use crate::domain::launcher::trace::log_launcher_trace;
use crate::domain::launcher::types::{
    FindSmapiInstallerDownloadsResult, SmapiInstallerDownloadCandidate, SmapiInstallerNaming,
};
use crate::domain::launcher::updates::{
    resolve_smapi_runtime_versions, resolve_update_check_game_root,
};
use crate::domain::launcher::versions::{
    compare_parsed_versions, parse_mod_version, version_is_newer,
};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use std::fs;
use std::path::Path;

/// Scans the user's download directories (top level only) for SMAPI installer
/// archives they already downloaded manually, newest version first.
///
/// Directories: `settings.download_path` (when set) plus `dirs::download_dir()`.
/// The scan is deliberately non-recursive — installer zips land directly in the
/// Downloads folder and nested copies would only add noise.
///
/// `compatible` / `satisfies_target` are computed against the game-compatible
/// maximum and the current target version. The latest reference comes from the
/// fresh `check_smapi_update` disk cache (this is a cheap io command — no
/// network); when that, the game version, or the installed SMAPI is unavailable,
/// the flags are `None` rather than guessed. The command never errors for a
/// missing game setup; it returns candidates with unknown flags.
pub fn find_smapi_installer_downloads_blocking() -> anyhow::Result<FindSmapiInstallerDownloadsResult>
{
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "find_smapi_installer_downloads",
        (|| {
            let settings_path = launcher_settings_path()?;
            let settings = load_or_create_settings_at_path(&settings_path)?;

            let mut dirs = Vec::new();
            if let Some(path) = settings
                .download_path
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(clean_input_path)
            {
                dirs.push(path);
            }
            if let Some(default_dir) = dirs::download_dir() {
                let default_dir = clean_input_path(&default_dir.to_string_lossy());
                if !dirs
                    .iter()
                    .any(|dir| normalize_path(dir) == normalize_path(&default_dir))
                {
                    dirs.push(default_dir);
                }
            }

            let mods_path = settings
                .mods_path
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or_default();
            let game_root = resolve_update_check_game_root(&settings, mods_path);
            let game_root_ready = game_root.as_deref().is_some_and(|root| root.is_dir());
            let installed_detected = game_root_ready
                && (game_root
                    .as_deref()
                    .expect("game root present when ready")
                    .join("StardewModdingAPI.dll")
                    .is_file()
                    || game_root
                        .as_deref()
                        .expect("game root present when ready")
                        .join("StardewModdingAPI.exe")
                        .is_file());

            let cache_path = launcher_smapi_update_cache_path()?;
            let now_ms = current_timestamp_ms();
            let cached_latest = load_cached_latest_smapi_release(&cache_path, now_ms);

            let game_compatible_max = match (game_root_ready, cached_latest.as_ref()) {
                (true, Some(latest)) => {
                    let versions = resolve_smapi_runtime_versions(&settings, mods_path);
                    max_game_compatible_smapi_version(
                        &versions.game_version,
                        &latest.version,
                        latest
                            .minimum_game_version
                            .as_deref()
                            .unwrap_or(SMAPI_LATEST_MINIMUM_GAME_VERSION),
                    )
                }
                _ => None,
            };
            let target_version = if installed_detected {
                Some(game_compatible_max.clone().unwrap_or_else(|| {
                    resolve_smapi_runtime_versions(&settings, mods_path).api_version
                }))
            } else {
                None
            };

            let mut candidates = Vec::new();
            for dir in dirs {
                collect_installer_candidates_from_dir(&dir, &mut candidates);
            }
            enrich_installer_candidate_flags(
                &mut candidates,
                game_compatible_max.as_deref(),
                target_version.as_deref(),
            );
            sort_installer_candidates(&mut candidates);
            log_launcher_trace("smapiUpdate.find.complete", |event| {
                event.count("candidateCount", candidates.len())
            });
            Ok(FindSmapiInstallerDownloadsResult { candidates })
        })(),
    )
}

/// Sorts candidates newest version first (ties by file name).
pub(crate) fn sort_installer_candidates(candidates: &mut [SmapiInstallerDownloadCandidate]) {
    candidates.sort_by(|left, right| {
        match (
            parse_mod_version(&left.version),
            parse_mod_version(&right.version),
        ) {
            (Some(left_version), Some(right_version)) => {
                compare_parsed_versions(&right_version, &left_version)
                    .then_with(|| left.file_name.cmp(&right.file_name))
            }
            _ => left.file_name.cmp(&right.file_name),
        }
    });
}

/// Collects recognized SMAPI installer archives from one directory (top level
/// only). Unreadable entries are skipped, never errors.
pub(crate) fn collect_installer_candidates_from_dir(
    dir: &Path,
    out: &mut Vec<SmapiInstallerDownloadCandidate>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(file_name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        let Some((version, kind)) = parse_smapi_installer_file_name(&file_name) else {
            continue;
        };
        let size_bytes = entry.metadata().ok().map(|metadata| metadata.len());
        let (double_zipped, naming) = match kind {
            SmapiInstallerFileKind::Github { double_zipped } => {
                (double_zipped, SmapiInstallerNaming::Github)
            }
            SmapiInstallerFileKind::Nexus => (false, SmapiInstallerNaming::Nexus),
        };
        out.push(SmapiInstallerDownloadCandidate {
            path: normalize_path(&path),
            file_name,
            version,
            size_bytes,
            double_zipped,
            naming,
            compatible: None,
            satisfies_target: None,
        });
    }
}

/// Computes the `compatible` / `satisfies_target` flags: version within the
/// game-compatible maximum, and version at or above the current target.
pub(crate) fn enrich_installer_candidate_flags(
    candidates: &mut [SmapiInstallerDownloadCandidate],
    game_compatible_max: Option<&str>,
    target_version: Option<&str>,
) {
    for candidate in candidates {
        candidate.compatible =
            game_compatible_max.map(|max| !version_is_newer(max, &candidate.version));
        candidate.satisfies_target =
            target_version.map(|target| !version_is_newer(&candidate.version, target));
    }
}
