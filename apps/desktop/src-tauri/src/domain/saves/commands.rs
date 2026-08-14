use crate::AppHandle;
use crate::domain;
use crate::domain::saves::DefaultSaveSlotSummary;
use host_command_macros::host_command;

#[host_command(io)]
pub async fn scan_default_save_slots(
    app: AppHandle,
) -> Result<Vec<DefaultSaveSlotSummary>, String> {
    domain::saves::scan_default_save_slots()
}
