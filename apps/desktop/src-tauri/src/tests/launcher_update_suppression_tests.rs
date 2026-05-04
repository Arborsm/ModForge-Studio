use super::{
    partition_update_candidates_for_request, UpdateCheckCandidate,
    AUTO_UPDATE_FAILURE_SUPPRESSION_THRESHOLD,
};
use crate::domain::launcher::update_cache::{
    clear_launcher_update_auto_failures_at_path, load_launcher_update_auto_failures_at_path,
    load_suppressed_launcher_update_mod_ids_at_path, record_launcher_update_auto_failure_at_path,
};
use crate::test_support::create_temp_dir;
use std::fs;

fn sample_candidate(mod_id: i64) -> UpdateCheckCandidate {
    UpdateCheckCandidate {
        mod_id,
        unique_id: Some(format!("ModForge.Sample.{mod_id}")),
        name: format!("Sample Mod {mod_id}"),
        current_version: "1.0.0".to_string(),
        absolute_path: format!(r"C:\Games\Stardew Valley\Mods\Sample Mod {mod_id}"),
        update_keys: vec![format!("Nexus:{mod_id}")],
    }
}

#[test]
fn auto_failure_count_reaches_threshold_before_suppression() {
    let root = create_temp_dir("launcher-update-auto-failure-threshold");
    let cache_path = root.join("launcher").join("updates-cache.json");
    let mods_path = r"C:\Games\Stardew Valley\Mods";
    let mod_id = 20781;

    let first = record_launcher_update_auto_failure_at_path(
        &cache_path,
        mods_path,
        mod_id,
        1_000,
        Some("all fallbacks failed"),
    )
    .expect("record first auto failure");
    let second = record_launcher_update_auto_failure_at_path(
        &cache_path,
        mods_path,
        mod_id,
        2_000,
        Some("all fallbacks failed"),
    )
    .expect("record second auto failure");
    let third = record_launcher_update_auto_failure_at_path(
        &cache_path,
        mods_path,
        mod_id,
        3_000,
        Some("all fallbacks failed"),
    )
    .expect("record third auto failure");

    assert_eq!(first.failure_count, 1);
    assert_eq!(second.failure_count, 2);
    assert_eq!(
        third.failure_count,
        AUTO_UPDATE_FAILURE_SUPPRESSION_THRESHOLD
    );

    let suppressed = load_suppressed_launcher_update_mod_ids_at_path(
        &cache_path,
        mods_path,
        AUTO_UPDATE_FAILURE_SUPPRESSION_THRESHOLD,
    )
    .expect("load suppressed auto failure mod ids");
    assert!(suppressed.contains(&mod_id));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn clearing_auto_failure_state_removes_suppression_after_manual_success() {
    let root = create_temp_dir("launcher-update-auto-failure-clear");
    let cache_path = root.join("launcher").join("updates-cache.json");
    let mods_path = r"C:\Games\Stardew Valley\Mods";
    let mod_id = 21285;

    for attempt in 1..=AUTO_UPDATE_FAILURE_SUPPRESSION_THRESHOLD {
        record_launcher_update_auto_failure_at_path(
            &cache_path,
            mods_path,
            mod_id,
            u128::from(attempt) * 1_000,
            Some("all fallbacks failed"),
        )
        .expect("record auto failure");
    }

    clear_launcher_update_auto_failures_at_path(&cache_path, mods_path, &[mod_id])
        .expect("clear auto failure state");

    let reloaded = load_launcher_update_auto_failures_at_path(&cache_path, mods_path, mod_id)
        .expect("reload auto failure state");
    let suppressed = load_suppressed_launcher_update_mod_ids_at_path(
        &cache_path,
        mods_path,
        AUTO_UPDATE_FAILURE_SUPPRESSION_THRESHOLD,
    )
    .expect("load suppressed auto failure mod ids");

    assert_eq!(reloaded, None);
    assert!(!suppressed.contains(&mod_id));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn suppressed_mod_id_lookup_only_returns_entries_at_or_above_threshold() {
    let root = create_temp_dir("launcher-update-auto-failure-suppressed-list");
    let cache_path = root.join("launcher").join("updates-cache.json");
    let mods_path = r"C:\Games\Stardew Valley\Mods";
    let suppressed_mod_id = 14928;
    let active_mod_id = 22736;

    for attempt in 1..=AUTO_UPDATE_FAILURE_SUPPRESSION_THRESHOLD {
        record_launcher_update_auto_failure_at_path(
            &cache_path,
            mods_path,
            suppressed_mod_id,
            u128::from(attempt) * 1_000,
            Some("all fallbacks failed"),
        )
        .expect("record suppressed auto failure");
    }
    for attempt in 1..AUTO_UPDATE_FAILURE_SUPPRESSION_THRESHOLD {
        record_launcher_update_auto_failure_at_path(
            &cache_path,
            mods_path,
            active_mod_id,
            10_000 + u128::from(attempt) * 1_000,
            Some("all fallbacks failed"),
        )
        .expect("record non-suppressed auto failure");
    }

    let suppressed = load_suppressed_launcher_update_mod_ids_at_path(
        &cache_path,
        mods_path,
        AUTO_UPDATE_FAILURE_SUPPRESSION_THRESHOLD,
    )
    .expect("load suppressed auto failure mod ids");

    assert!(suppressed.contains(&suppressed_mod_id));
    assert!(!suppressed.contains(&active_mod_id));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn partitioned_candidates_skip_suppressed_mods_only_for_automatic_checks() {
    let candidates = vec![sample_candidate(22731), sample_candidate(22732)];
    let suppressed_mod_ids = std::collections::HashSet::from([22732_i64]);

    let (automatic_candidates, automatic_skipped) =
        partition_update_candidates_for_request(candidates.clone(), &suppressed_mod_ids, false);
    let (manual_candidates, manual_skipped) =
        partition_update_candidates_for_request(candidates, &suppressed_mod_ids, true);

    assert_eq!(
        automatic_candidates
            .iter()
            .map(|candidate| candidate.mod_id)
            .collect::<Vec<_>>(),
        vec![22731]
    );
    assert_eq!(automatic_skipped, vec![22732]);
    assert_eq!(
        manual_candidates
            .iter()
            .map(|candidate| candidate.mod_id)
            .collect::<Vec<_>>(),
        vec![22731, 22732]
    );
    assert!(manual_skipped.is_empty());
}
