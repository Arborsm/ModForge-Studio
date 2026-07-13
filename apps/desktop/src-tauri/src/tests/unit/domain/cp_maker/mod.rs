mod export_tests;
mod map_asset_tests;
mod storage_tests;

use crate::domain::cp_maker::types::CpMakerSession;
use crate::domain::cp_maker::{load_cp_maker_session_at_path, save_cp_maker_session_at_path};
use crate::test_support::create_temp_dir;
use std::fs;

#[test]
fn cp_maker_session_round_trips_and_normalizes_keys() {
    let root = create_temp_dir("cp-maker-session");
    let path = root.join("session.json");
    let saved = save_cp_maker_session_at_path(
        &path,
        CpMakerSession {
            active_draft_key: Some("  draft-1  ".to_string()),
            active_generated_draft_key: Some("   ".to_string()),
        },
    )
    .expect("save session");
    assert_eq!(saved.active_draft_key.as_deref(), Some("draft-1"));
    assert!(saved.active_generated_draft_key.is_none());
    assert_eq!(
        load_cp_maker_session_at_path(&path).expect("load session"),
        saved
    );
    assert!(!path.with_extension("tmp").exists());
    fs::remove_dir_all(root).expect("cleanup");
}
