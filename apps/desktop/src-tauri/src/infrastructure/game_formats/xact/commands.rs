use crate::AppHandle;
use host_command_macros::host_command;

#[host_command(io)]
pub async fn load_xact_audio_data_url(
    app: AppHandle,
    root_path: String,
    cue: String,
) -> Result<String, String> {
    crate::infrastructure::game_formats::xact::load_xact_audio_data_url(&root_path, &cue)
}
