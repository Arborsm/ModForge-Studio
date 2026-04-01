pub(crate) fn unsupported_project_error(path: &str) -> String {
    format!("No Content Patcher manifest/content snapshot could be loaded from {path}")
}

pub(crate) fn missing_file_error(path: &str) -> String {
    format!("Required file was not found: {path}")
}
