pub(crate) fn unsupported_project_error(path: &str) -> String {
    format!("No Content Patcher project could be loaded from {path}")
}

pub(crate) fn missing_file_error(path: &str) -> String {
    format!("Required file was not found: {path}")
}

pub(crate) fn non_content_patcher_manifest_error(unique_id: Option<&str>) -> String {
    match unique_id {
        Some(value) => format!(
            "manifest.json ContentPackFor.UniqueID must be Pathoschild.ContentPatcher, found {value}"
        ),
        None => {
            "manifest.json ContentPackFor.UniqueID must be Pathoschild.ContentPatcher".to_string()
        }
    }
}

pub(crate) fn include_outside_root_error(path: &str) -> String {
    format!("Include path resolves outside the project root: {path}")
}
