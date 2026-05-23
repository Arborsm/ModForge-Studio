use super::apply_edit_data_patch;
use crate::domain::content_patcher::context::SimulationContext;
use serde_json::{json, Map, Value};

fn patch_from(obj: Value) -> Map<String, Value> {
    obj.as_object().unwrap().clone()
}

#[test]
fn apply_fields_modifies_nested_field() {
    // Fields operates on the target value directly (no Entries wrapper)
    let mut base = json!({
        "Emily": {
            "DisplayName": "Emily",
            "Price": 100
        }
    });
    let patch = patch_from(json!({
        "Fields": {
            "Emily": {
                "Price": 200
            }
        }
    }));
    let result = apply_edit_data_patch(&mut base, &patch, &SimulationContext::default(), None);
    assert!(result.is_ok(), "{result:?}");
    let emily = base.get("Emily").unwrap().as_object().unwrap();
    assert_eq!(emily.get("Price").unwrap().as_i64(), Some(200));
    assert_eq!(emily.get("DisplayName").unwrap().as_str(), Some("Emily"));
}

#[test]
fn apply_text_operations_append_and_prepend() {
    let mut base = json!({
        "Items": "a,b,c"
    });
    let patch = patch_from(json!({
        "TextOperations": [
            {
                "Operation": "Append",
                "Target": ["Items"],
                "Value": "d",
                "Delimiter": ","
            },
            {
                "Operation": "Prepend",
                "Target": ["Items"],
                "Value": "z",
                "Delimiter": ","
            }
        ]
    }));
    let result = apply_edit_data_patch(&mut base, &patch, &SimulationContext::default(), None);
    assert!(result.is_ok(), "{result:?}");
    let items = base.get("Items").unwrap().as_str().unwrap();
    // After prepend then append: "z,a,b,c,d"
    assert_eq!(items, "z,a,b,c,d");
}

#[test]
fn apply_text_operations_replace_delimited() {
    let mut base = json!({
        "Gifts": "a,b,c"
    });
    let patch = patch_from(json!({
        "TextOperations": [
            {
                "Operation": "ReplaceDelimited",
                "Target": ["Gifts"],
                "Search": "b",
                "Value": "x",
                "Delimiter": ","
            }
        ]
    }));
    let result = apply_edit_data_patch(&mut base, &patch, &SimulationContext::default(), None);
    assert!(result.is_ok(), "{result:?}");
    let gifts = base.get("Gifts").unwrap().as_str().unwrap();
    assert_eq!(gifts, "a,x,c");
}

#[test]
fn apply_text_operations_remove_delimited() {
    let mut base = json!({
        "Gifts": "a,b,c"
    });
    let patch = patch_from(json!({
        "TextOperations": [
            {
                "Operation": "RemoveDelimited",
                "Target": ["Gifts"],
                "Search": "b",
                "Delimiter": ","
            }
        ]
    }));
    let result = apply_edit_data_patch(&mut base, &patch, &SimulationContext::default(), None);
    assert!(result.is_ok(), "{result:?}");
    let gifts = base.get("Gifts").unwrap().as_str().unwrap();
    assert_eq!(gifts, "a,c");
}

#[test]
fn apply_move_entries_reorders_array() {
    // MoveEntries requires the target value itself to be an array
    let mut base = json!([
        { "Id": "a", "Name": "First" },
        { "Id": "b", "Name": "Second" },
        { "Id": "c", "Name": "Third" }
    ]);
    let patch = patch_from(json!({
        "MoveEntries": [
            { "ID": "c", "BeforeId": "a" }
        ]
    }));
    let result = apply_edit_data_patch(&mut base, &patch, &SimulationContext::default(), None);
    assert!(result.is_ok(), "{result:?}");
    let entries = base.as_array().unwrap();
    assert_eq!(entries[0]["Id"], "c");
    assert_eq!(entries[1]["Id"], "a");
    assert_eq!(entries[2]["Id"], "b");
}

#[test]
fn apply_move_entries_by_to_position() {
    let mut base = json!([
        { "Id": "a" },
        { "Id": "b" },
        { "Id": "c" }
    ]);
    let patch = patch_from(json!({
        "MoveEntries": [
            { "ID": "a", "ToPosition": "2" }
        ]
    }));
    let result = apply_edit_data_patch(&mut base, &patch, &SimulationContext::default(), None);
    assert!(result.is_ok(), "{result:?}");
    let entries = base.as_array().unwrap();
    assert_eq!(entries[0]["Id"], "b");
    assert_eq!(entries[1]["Id"], "c");
    assert_eq!(entries[2]["Id"], "a");
}

#[test]
fn apply_entries_replaces_and_adds() {
    // Entries operates on the target value directly
    let mut base = json!({
        "Existing": "old",
        "Keep": "value"
    });
    let patch = patch_from(json!({
        "Entries": {
            "Existing": "new",
            "NewEntry": "added"
        }
    }));
    let result = apply_edit_data_patch(&mut base, &patch, &SimulationContext::default(), None);
    assert!(result.is_ok(), "{result:?}");
    assert_eq!(base.get("Existing").unwrap().as_str(), Some("new"));
    assert_eq!(base.get("Keep").unwrap().as_str(), Some("value"));
    assert_eq!(base.get("NewEntry").unwrap().as_str(), Some("added"));
}

#[test]
fn apply_fields_with_nested_object_path() {
    let mut base = json!({
        "Emily": {
            "DisplayName": "Emily",
            "CustomFields": {}
        }
    });
    let patch = patch_from(json!({
        "Fields": {
            "Emily": {
                "CustomFields/MyMod/Flag": true,
                "DisplayName/Name": "New Emily"
            }
        }
    }));
    let result = apply_edit_data_patch(&mut base, &patch, &SimulationContext::default(), None);
    assert!(result.is_ok(), "{result:?}");
    let emily = base.get("Emily").unwrap().as_object().unwrap();
    let custom_fields = emily.get("CustomFields").unwrap().as_object().unwrap();
    let mymod = custom_fields.get("MyMod").unwrap().as_object().unwrap();
    assert_eq!(mymod.get("Flag").unwrap().as_bool(), Some(true));
    assert_eq!(
        emily
            .get("DisplayName")
            .unwrap()
            .as_object()
            .unwrap()
            .get("Name")
            .unwrap()
            .as_str(),
        Some("New Emily")
    );
    assert_eq!(
        emily
            .get("DisplayName")
            .unwrap()
            .as_object()
            .unwrap()
            .get("Name")
            .unwrap()
            .as_str(),
        Some("New Emily")
    );
}

#[test]
fn apply_entries_with_when_condition_applies_when_met() {
    let mut base = json!({
        "Keep": "value"
    });
    let patch = patch_from(json!({
        "Entries": {
            "ConditionalEntry": {
                "When": { "Season": "spring" },
                "Value": "applied"
            },
            "AlwaysEntry": "always"
        }
    }));
    let context = SimulationContext {
        season: Some("spring".to_string()),
        ..SimulationContext::default()
    };
    let result = apply_edit_data_patch(&mut base, &patch, &context, None);
    assert!(result.is_ok(), "{result:?}");
    assert_eq!(
        base.get("ConditionalEntry").unwrap().as_str(),
        Some("applied")
    );
    assert_eq!(base.get("AlwaysEntry").unwrap().as_str(), Some("always"));
    assert_eq!(base.get("Keep").unwrap().as_str(), Some("value"));
}

#[test]
fn apply_entries_with_when_condition_skips_when_not_met() {
    let mut base = json!({
        "Keep": "value"
    });
    let patch = patch_from(json!({
        "Entries": {
            "ConditionalEntry": {
                "When": { "Season": "winter" },
                "Value": "applied"
            },
            "AlwaysEntry": "always"
        }
    }));
    let context = SimulationContext {
        season: Some("spring".to_string()),
        ..SimulationContext::default()
    };
    let result = apply_edit_data_patch(&mut base, &patch, &context, None);
    assert!(result.is_ok(), "{result:?}");
    assert!(base.get("ConditionalEntry").is_none());
    assert_eq!(base.get("AlwaysEntry").unwrap().as_str(), Some("always"));
    assert_eq!(base.get("Keep").unwrap().as_str(), Some("value"));
}

#[test]
fn apply_entries_with_when_uses_object_without_when_as_value() {
    let mut base = json!({});
    let patch = patch_from(json!({
        "Entries": {
            "EntryWithData": {
                "When": { "Season": "spring" },
                "Name": "Test",
                "Price": 100
            }
        }
    }));
    let context = SimulationContext {
        season: Some("spring".to_string()),
        ..SimulationContext::default()
    };
    let result = apply_edit_data_patch(&mut base, &patch, &context, None);
    assert!(result.is_ok(), "{result:?}");
    let entry = base.get("EntryWithData").unwrap().as_object().unwrap();
    assert_eq!(entry.get("Name").unwrap().as_str(), Some("Test"));
    assert_eq!(entry.get("Price").unwrap().as_i64(), Some(100));
    assert!(entry.get("When").is_none());
}

#[test]
fn apply_entries_with_when_in_array_mode() {
    let mut base = json!([
        { "Id": "a", "Name": "First" }
    ]);
    let patch = patch_from(json!({
        "Entries": {
            "b": {
                "When": { "Season": "spring" },
                "Id": "b",
                "Name": "Second"
            },
            "c": {
                "When": { "Season": "winter" },
                "Id": "c",
                "Name": "Skipped"
            }
        }
    }));
    let context = SimulationContext {
        season: Some("spring".to_string()),
        ..SimulationContext::default()
    };
    let result = apply_edit_data_patch(&mut base, &patch, &context, None);
    assert!(result.is_ok(), "{result:?}");
    let arr = base.as_array().unwrap();
    assert_eq!(arr.len(), 2);
    assert_eq!(arr[0]["Id"], "a");
    assert_eq!(arr[1]["Id"], "b");
    assert_eq!(arr[1]["Name"], "Second");
}
