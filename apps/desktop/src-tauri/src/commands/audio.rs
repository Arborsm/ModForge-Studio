#[tauri::command]
pub fn load_xact_audio_data_url(root_path: String, cue: String) -> Result<String, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_xact_audio_data_url",
        crate::infrastructure::game_formats::xact::load_xact_audio_data_url_for_paths(
            &root_path, &cue,
        ),
    )
}
