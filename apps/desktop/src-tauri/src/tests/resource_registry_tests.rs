use super::{parse_character_entries, parse_item_entries, ResourceRegistryEntry};

fn values_for(entries: &[ResourceRegistryEntry], kind: &str) -> Vec<String> {
    entries
        .iter()
        .filter(|entry| entry.kind == kind)
        .map(|entry| entry.value.clone())
        .collect()
}

#[test]
fn parses_object_entries_as_event_item_values() {
    let mut entries = Vec::new();
    parse_item_entries(
        r#"{"24":{"DisplayName":"Parsnip","Name":"Parsnip"},"900":{"Name":"Festival Token"}}"#,
        &mut entries,
        "Game assets",
        "(O)",
        "Content/Data/Objects.xnb",
        "Data/Objects",
    )
    .expect("parse objects");

    assert_eq!(values_for(&entries, "item"), vec!["(O)24", "(O)900"]);
    assert_eq!(entries[0].label, "Parsnip (O)24");
    assert_eq!(entries[1].label, "Festival Token (O)900");
}

#[test]
fn parses_item_entries_with_asset_specific_qualifiers() {
    let mut entries = Vec::new();
    parse_item_entries(
        r#"{"12":{"DisplayName":"Chest"},"4":{"Name":"Stone Brazier"}}"#,
        &mut entries,
        "Game assets",
        "(BC)",
        "Content/Data/BigCraftables.xnb",
        "Data/BigCraftables",
    )
    .expect("parse big craftables");

    assert_eq!(values_for(&entries, "item"), vec!["(BC)12", "(BC)4"]);
    assert_eq!(entries[0].label, "Chest (BC)12");
    assert_eq!(
        entries[0].relative_path.as_deref(),
        Some("Content/Data/BigCraftables.xnb")
    );
}

#[test]
fn parses_character_entries_with_display_names() {
    let mut entries = Vec::new();
    parse_character_entries(
        r#"{"Abigail":{"DisplayName":"Abigail"},"CustomNpc":{}}"#,
        &mut entries,
        "Game assets",
    )
    .expect("parse characters");

    assert_eq!(values_for(&entries, "actor"), vec!["Abigail", "CustomNpc"]);
    assert_eq!(entries[1].label, "CustomNpc");
}
