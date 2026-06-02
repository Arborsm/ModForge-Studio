use super::{
    as_non_empty_string, build_snapshot_diagnostics, content_pack_for_unique_id, when_to_value,
};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[test]
fn as_non_empty_string_trims_and_rejects_blank_values() {
    assert_eq!(
        as_non_empty_string(Some(&Value::String("  Example  ".to_string()))),
        Some("Example".to_string())
    );
    assert_eq!(
        as_non_empty_string(Some(&Value::String("   ".to_string()))),
        None
    );
    assert_eq!(as_non_empty_string(Some(&Value::Bool(true))), None);
}

#[test]
fn content_pack_for_unique_id_reads_trimmed_unique_id() {
    let manifest = json!({
        "ContentPackFor": {
            "UniqueID": "  Pathoschild.ContentPatcher  "
        }
    });

    assert_eq!(
        content_pack_for_unique_id(&manifest),
        Some("Pathoschild.ContentPatcher".to_string())
    );
}

#[test]
fn build_snapshot_diagnostics_reports_missing_required_fields() {
    let diagnostics = build_snapshot_diagnostics(&json!({ "Name": "Pack" }), &json!({}));

    assert_eq!(diagnostics.len(), 3);
    assert!(
        diagnostics
            .iter()
            .any(|diag| diag.field.as_deref() == Some("manifest.UniqueID"))
    );
    assert!(
        diagnostics
            .iter()
            .any(|diag| diag.field.as_deref() == Some("content.Format"))
    );
    assert!(
        diagnostics
            .iter()
            .any(|diag| diag.field.as_deref() == Some("content.Changes"))
    );
}

#[test]
fn when_to_value_preserves_sorted_entries() {
    let mut when = BTreeMap::new();
    when.insert("Season".to_string(), json!("spring"));
    when.insert("Day".to_string(), json!(5));

    assert_eq!(
        when_to_value(&when),
        json!({
            "Day": 5,
            "Season": "spring"
        })
    );
}
