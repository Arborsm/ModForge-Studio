use super::{CREATE_NEW_CONSOLE, CREATE_NO_WINDOW, LauncherProcessOptions};
use crate::domain::launcher::types::LauncherSettings;

#[test]
fn launcher_process_options_hide_console_window_by_default() {
    let options = LauncherProcessOptions::from_settings(&LauncherSettings::default());
    assert_eq!(options.windows_creation_flags, CREATE_NO_WINDOW);
}

#[test]
fn launcher_process_options_use_dedicated_console_when_enabled() {
    let settings = LauncherSettings {
        show_console_window: true,
        ..LauncherSettings::default()
    };

    let options = LauncherProcessOptions::from_settings(&settings);
    // A dedicated new console window; never inherit ModForge's own console.
    assert_eq!(options.windows_creation_flags, CREATE_NEW_CONSOLE);
}
