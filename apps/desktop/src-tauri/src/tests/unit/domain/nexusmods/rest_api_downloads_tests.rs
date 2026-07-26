use super::select_download_candidate;
use serde_json::json;

fn file_entry(
    file_id: i64,
    version: &str,
    category_id: i64,
    category_name: &str,
    uploaded_timestamp: i64,
    is_primary: bool,
) -> serde_json::Value {
    json!({
        "file_id": file_id,
        "file_name": format!("file-{file_id}.zip"),
        "version": version,
        "category_id": category_id,
        "category_name": category_name,
        "uploaded_timestamp": uploaded_timestamp,
        "is_primary": is_primary,
    })
}

#[test]
fn select_download_candidate_prefers_main_file_over_first_optional_match() {
    let payload = json!({
        "files": [
            file_entry(10, "1.2.0", 3, "OPTIONAL", 200, false),
            file_entry(11, "1.2.0", 1, "MAIN", 100, false),
        ]
    });

    let candidate =
        select_download_candidate(&payload, None, Some("1.2.0")).expect("select candidate");

    assert_eq!(candidate.file_id, 11);
    assert_eq!(candidate.file_name, "file-11.zip");
}

#[test]
fn select_download_candidate_prefers_primary_file_within_same_version() {
    let payload = json!({
        "files": [
            file_entry(10, "1.2.0", 1, "MAIN", 300, false),
            file_entry(11, "1.2.0", 1, "MAIN", 100, true),
        ]
    });

    let candidate =
        select_download_candidate(&payload, None, Some("1.2.0")).expect("select candidate");

    assert_eq!(candidate.file_id, 11);
}

#[test]
fn select_download_candidate_prefers_newest_upload_within_same_category() {
    let payload = json!({
        "files": [
            file_entry(10, "1.2.0", 1, "MAIN", 100, false),
            file_entry(11, "1.2.0", 1, "MAIN", 200, false),
        ]
    });

    let candidate =
        select_download_candidate(&payload, None, Some("1.2.0")).expect("select candidate");

    assert_eq!(candidate.file_id, 11);
}

#[test]
fn select_download_candidate_without_version_prefers_main_over_newer_optional() {
    let payload = json!({
        "files": [
            file_entry(10, "1.1.0", 1, "MAIN", 100, false),
            file_entry(11, "1.2.0", 3, "OPTIONAL", 200, false),
        ]
    });

    let candidate = select_download_candidate(&payload, None, None).expect("select candidate");

    assert_eq!(candidate.file_id, 10);
}

#[test]
fn select_download_candidate_errors_when_requested_version_is_missing() {
    let payload = json!({
        "files": [file_entry(10, "1.1.0", 1, "MAIN", 100, false)]
    });

    let result = select_download_candidate(&payload, None, Some("9.9.9"));

    assert!(result.is_err());
}

#[test]
fn select_download_candidate_honours_explicit_file_id() {
    let payload = json!({
        "files": [
            file_entry(10, "1.2.0", 1, "MAIN", 100, false),
            file_entry(11, "1.2.0", 3, "OPTIONAL", 200, false),
        ]
    });

    let candidate =
        select_download_candidate(&payload, Some(11), Some("1.2.0")).expect("select candidate");

    assert_eq!(candidate.file_id, 11);
    assert_eq!(candidate.version.as_deref(), Some("1.2.0"));
}
