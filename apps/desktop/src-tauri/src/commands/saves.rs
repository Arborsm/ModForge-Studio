use crate::domain::saves as domain_saves;
use crate::domain::saves::DefaultSaveSlotSummary;

#[tauri::command]
pub fn scan_default_save_slots() -> Result<Vec<DefaultSaveSlotSummary>, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "scan_default_save_slots",
        domain_saves::scan_default_save_slots(),
    )
}
