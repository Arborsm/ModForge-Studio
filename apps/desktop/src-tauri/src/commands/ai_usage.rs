use crate::domain::localization::types::*;
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

macro_rules! execute {
    ($app:expr,$debug:expr,$name:ident,$args:expr) => {
        crate::commands::runtime::execute_tauri_command(
            AppHandle::from_tauri($app),
            $debug.inner().clone(),
            crate::host_command_name!($name),
            $args,
        )
        .await
    };
}

#[tauri::command]
pub async fn query_ai_usage_summary(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: AiUsageQuery,
) -> Result<AiUsageSummary, String> {
    execute!(
        app,
        debug,
        query_ai_usage_summary,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn query_ai_usage_records(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: AiUsageQuery,
) -> Result<AiUsageRecordPage, String> {
    execute!(
        app,
        debug,
        query_ai_usage_records,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn export_ai_usage(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: AiUsageExportRequest,
) -> Result<u64, String> {
    execute!(app, debug, export_ai_usage, json!({"request":request}))
}
#[tauri::command]
pub async fn clear_ai_usage(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: AiUsageClearRequest,
) -> Result<AiUsageClearResult, String> {
    execute!(app, debug, clear_ai_usage, json!({"request":request}))
}
