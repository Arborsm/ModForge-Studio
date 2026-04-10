mod archive;
mod catalog;
mod downloads;
mod fs;
mod http;
mod image_cache;
mod launch;
mod library;
mod paths;
mod settings;
mod trace;
mod types;

pub use archive::{inspect_launcher_archive, install_launcher_archive};
pub use catalog::{check_launcher_updates, load_launcher_remote_mod_detail, search_launcher_catalog};
pub use downloads::{
    download_launcher_mod, load_launcher_download_queue, save_launcher_download_queue,
};
pub use image_cache::resolve_launcher_image;
pub use launch::{get_launcher_backup_directory, launch_launcher_game, open_launcher_path};
pub use library::{
    load_launcher_library_covers, load_launcher_library_state, save_launcher_library_state,
    scan_launcher_library, set_launcher_library_cover, set_launcher_mod_enabled,
};
pub use settings::{load_launcher_settings, save_launcher_settings};

#[cfg(test)]
#[path = "../tests/launcher_tests.rs"]
mod tests;
