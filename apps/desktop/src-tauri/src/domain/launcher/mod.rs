pub mod archive;
pub(crate) mod commands;
pub mod downloads;
pub mod fs;
pub mod image_cache;
pub mod image_failures;
pub mod install_manager;
pub mod library;
pub mod mod_config;
pub mod runtime;
pub mod settings;
pub mod smapi_update;
pub mod trace;
pub mod types;
pub mod update_cache;
pub mod updates;
pub mod versions;

#[cfg(test)]
#[path = "../../tests/integration/launcher_tests.rs"]
mod launcher_tests;
