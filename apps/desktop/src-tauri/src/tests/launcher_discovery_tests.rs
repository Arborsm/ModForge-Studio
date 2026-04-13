#[test]
fn discovery_does_not_use_removed_legacy_catalog_widget_endpoint() {
    let source = include_str!("../domain/launcher/discovery.rs");

    assert!(!source.contains("Core/Libs/Common/Widgets/ModList"));
}
