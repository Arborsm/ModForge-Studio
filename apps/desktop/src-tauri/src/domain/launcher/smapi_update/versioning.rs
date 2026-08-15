//! Game-version/SMAPI compatibility resolution and target selection.
//!
//! The game-version compatibility table is a faithful port of SMAPI's
//! `Constants.GetCompatibleApiVersion` (src/SMAPI/Constants.cs) and must be kept
//! in sync with SMAPI releases. Target selection and the mod `MinimumApiVersion`
//! pressure scan also live here.

use crate::domain::launcher::library::scan_library_at_path;
use crate::domain::launcher::types::SmapiUpdateRequiredByMod;
use crate::domain::launcher::versions::{
    ParsedModVersion, compare_parsed_versions, parse_mod_version, version_is_newer,
};
use crate::infrastructure::fs::pathing::clean_input_path;
use std::cmp::Ordering;

/// Game version -> recommended SMAPI version table, ported from SMAPI's
/// `Constants.GetCompatibleApiVersion` (src/SMAPI/Constants.cs). SMAPI deliberately
/// lists only game updates that need a pinned older SMAPI; intermediate game
/// versions resolve to the nearest listed version at or below them (see
/// [`max_game_compatible_smapi_version`]).
pub(crate) const GAME_VERSION_SMAPI_TABLE: &[(&str, &str)] = &[
    ("1.6.8", "4.0.8"),
    ("1.6.7", "4.0.8"),
    ("1.6.6", "4.0.8"),
    ("1.6.5", "4.0.8"),
    ("1.6.4", "4.0.8"),
    ("1.6.3", "4.0.6"),
    ("1.6.2", "4.0.6"),
    ("1.6.1", "4.0.6"),
    ("1.6.0", "4.0.6"),
    ("1.5.6", "3.18.6"),
    ("1.5.5", "3.13.2"),
    ("1.5.4", "3.12.8"),
    ("1.5.3", "3.8.4"),
    ("1.5.2", "3.8.3"),
    ("1.5.1", "3.8.2"),
    ("1.5.0", "3.8.0"),
    ("1.4.5", "3.7.6"),
    ("1.4.4", "3.7.6"),
    ("1.4.3", "3.7.6"),
    ("1.4.2", "3.7.6"),
    ("1.4.1", "3.7.6"),
    ("1.4.0", "3.0.1"),
    ("1.3.36", "2.11.2"),
    ("1.3.33", "2.10.2"),
    ("1.3.32", "2.10.2"),
    ("1.3.28", "2.7.0"),
    ("1.2.33", "2.5.5"),
    ("1.2.32", "2.5.5"),
    ("1.2.31", "2.5.5"),
    ("1.2.30", "2.5.5"),
    ("1.2.29", "1.13.1"),
    ("1.2.28", "1.13.1"),
    ("1.2.27", "1.13.1"),
    ("1.2.26", "1.13.1"),
    ("1.1.1", "1.9.0"),
    ("1.1.0", "1.9.0"),
    ("1.0.7.1", "0.40.0"),
    ("1.0.7", "0.40.0"),
    ("1.0.6", "0.40.0"),
    ("1.0.5.2", "0.40.0"),
    ("1.0.5.1", "0.40.0"),
    ("1.0.5", "0.40.0"),
    ("1.0.4", "0.40.0"),
    ("1.0.3", "0.40.0"),
    ("1.0.2", "0.40.0"),
    ("1.0.1", "0.40.0"),
    ("1.0.0", "0.40.0"),
];

/// Minimum game version required by the current SMAPI stable release, used as the
/// fallback when a release body does not state its own requirement. Keep in sync
/// with SMAPI's `Constants.MinimumGameVersion` when bumping the table.
pub(crate) const SMAPI_LATEST_MINIMUM_GAME_VERSION: &str = "1.6.14";

/// The highest SMAPI version the given game version supports:
/// - the candidate latest when the game meets its minimum game version;
/// - otherwise the ported compatibility table: an exact game version match, or the
///   nearest listed game version at or below the user's game (never newer than what
///   the game is known to support).
/// Returns `None` for game versions older than every table entry or unparseable.
pub(crate) fn max_game_compatible_smapi_version(
    game_version: &str,
    candidate_latest: &str,
    candidate_latest_minimum_game_version: &str,
) -> Option<String> {
    let game_parsed = parse_mod_version(game_version)?;
    let game_meets_latest_minimum = parse_mod_version(candidate_latest_minimum_game_version)
        .is_none_or(|minimum| compare_parsed_versions(&game_parsed, &minimum) != Ordering::Less);
    if game_meets_latest_minimum {
        return Some(candidate_latest.to_string());
    }

    let mut nearest_below: Option<(ParsedModVersion, &str)> = None;
    for (table_game, table_smapi) in GAME_VERSION_SMAPI_TABLE {
        let Some(table_parsed) = parse_mod_version(table_game) else {
            continue;
        };
        match compare_parsed_versions(&table_parsed, &game_parsed) {
            Ordering::Equal => return Some((*table_smapi).to_string()),
            Ordering::Less => {
                let is_newer_below = nearest_below.as_ref().is_none_or(|(current_best, _)| {
                    compare_parsed_versions(&table_parsed, current_best) == Ordering::Greater
                });
                if is_newer_below {
                    nearest_below = Some((table_parsed, table_smapi));
                }
            }
            Ordering::Greater => {}
        }
    }
    nearest_below.map(|(_, smapi)| smapi.to_string())
}

pub(crate) struct SmapiTargetSelection {
    pub(crate) target_version: String,
    pub(crate) update_available: bool,
}

/// Picks the SMAPI version to install:
/// - target is the highest game-compatible SMAPI (the latest release when the game
///   meets its minimum). Mod `MinimumApiVersion` pressure does not change the
///   target — the game-compatible maximum either satisfies it or nothing can — but
///   the unsatisfied mods stay visible via `requiredByMods`.
/// - when the game is older than every known mapping, the latest is reported for
///   reference only and no update is offered.
pub(crate) fn select_smapi_update_target(
    installed_version: &str,
    game_version: &str,
    candidate_latest: &str,
    candidate_latest_minimum_game_version: &str,
) -> SmapiTargetSelection {
    let Some(game_compatible) = max_game_compatible_smapi_version(
        game_version,
        candidate_latest,
        candidate_latest_minimum_game_version,
    ) else {
        return SmapiTargetSelection {
            target_version: candidate_latest.to_string(),
            update_available: false,
        };
    };
    SmapiTargetSelection {
        update_available: version_is_newer(installed_version, &game_compatible),
        target_version: game_compatible,
    }
}

/// Collects installed mods whose declared `MinimumApiVersion` is newer than the
/// installed SMAPI version, sorted by mod name. A missing/unreadable Mods folder
/// yields an empty list (nothing requires a newer SMAPI).
pub(crate) fn scan_required_smapi_mods(
    mods_path: &str,
    installed_version: &str,
) -> anyhow::Result<Vec<SmapiUpdateRequiredByMod>> {
    let mods_path = mods_path.trim();
    if mods_path.is_empty() {
        return Ok(Vec::new());
    }
    let mods_root = clean_input_path(mods_path);
    if !mods_root.is_dir() {
        return Ok(Vec::new());
    }

    let scan = scan_library_at_path(&mods_root)?;
    let mut required = scan
        .mods
        .iter()
        .filter_map(|summary| {
            let minimum_api_version = summary.minimum_api_version.as_deref()?;
            if !version_is_newer(installed_version, minimum_api_version) {
                return None;
            }
            Some(SmapiUpdateRequiredByMod {
                mod_id: summary
                    .unique_id
                    .clone()
                    .unwrap_or_else(|| summary.id.clone()),
                mod_name: summary.name.clone(),
                minimum_api_version: minimum_api_version.to_string(),
            })
        })
        .collect::<Vec<_>>();
    required.sort_by(|left, right| {
        left.mod_name
            .to_ascii_lowercase()
            .cmp(&right.mod_name.to_ascii_lowercase())
    });
    Ok(required)
}
