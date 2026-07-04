use crate::AppHandle;
use crate::host_commands::HostCommandName;
use crate::host_runtime::{
    HostCommandResourceLocks, HostCommandResponse, HostCommandResponseWriter, HostCommandScheduler,
    HostCommandSchedulerConfig,
};
use crate::sidecar::{
    ResolvedSidecarCommandOrResponse, RpcRequest, SidecarContext, resolve_command,
};
use crate::support::logging::DebugLoggingState;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::async_runtime::{
    Receiver as AsyncReceiver, Sender as AsyncSender, channel as async_channel,
};

struct TauriCommandResponseWriter {
    pending: Mutex<HashMap<String, AsyncSender<HostCommandResponse>>>,
}

impl TauriCommandResponseWriter {
    fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
        }
    }

    fn register(&self, id: String) -> Result<AsyncReceiver<HostCommandResponse>, String> {
        let (sender, receiver) = async_channel(1);
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| "Tauri host command pending map lock was poisoned.".to_string())?;
        pending.insert(id, sender);
        Ok(receiver)
    }
}

impl HostCommandResponseWriter for TauriCommandResponseWriter {
    fn write_response(&self, response: &HostCommandResponse) -> Result<(), String> {
        let Some(id) = response.id.as_str() else {
            return Err(format!(
                "Tauri host command response id must be a string: {}",
                response.id
            ));
        };
        let sender = self
            .pending
            .lock()
            .map_err(|_| "Tauri host command pending map lock was poisoned.".to_string())?
            .remove(id)
            .ok_or_else(|| format!("No pending Tauri host command for response id {id}."))?;
        sender
            .try_send(response.clone())
            .map_err(|error| format!("Failed to deliver Tauri host command response: {error}"))
    }
}

struct TauriCommandRuntime {
    scheduler: HostCommandScheduler,
    writer: Arc<TauriCommandResponseWriter>,
    next_id: AtomicU64,
}

impl TauriCommandRuntime {
    fn new(debug_logging_state: DebugLoggingState) -> Self {
        let writer = Arc::new(TauriCommandResponseWriter::new());
        let scheduler = HostCommandScheduler::new(
            writer.clone(),
            Arc::new(HostCommandResourceLocks::new()),
            HostCommandSchedulerConfig::default(),
            debug_logging_state,
        );
        Self {
            scheduler,
            writer,
            next_id: AtomicU64::new(1),
        }
    }

    fn next_request_id(&self) -> String {
        format!("tauri:{}", self.next_id.fetch_add(1, Ordering::Relaxed))
    }
}

static TAURI_COMMAND_RUNTIME: OnceLock<TauriCommandRuntime> = OnceLock::new();

fn runtime(debug_logging_state: DebugLoggingState) -> &'static TauriCommandRuntime {
    TAURI_COMMAND_RUNTIME.get_or_init(|| TauriCommandRuntime::new(debug_logging_state))
}

pub fn print_host_runtime_diagnostics_summary(reason: &str) {
    if let Some(runtime) = TAURI_COMMAND_RUNTIME.get() {
        runtime.scheduler.print_diagnostics_summary(reason);
    }
}

fn response_to_result<T>(
    command: &HostCommandName,
    response: HostCommandResponse,
) -> Result<T, String>
where
    T: DeserializeOwned,
{
    let command = command.as_str();
    if !response.ok {
        return Err(response
            .error
            .map(|error| match error {
                Value::String(message) => message,
                other => other.to_string(),
            })
            .unwrap_or_else(|| format!("Host command {command} failed.")));
    }

    serde_json::from_value(response.result.unwrap_or(Value::Null))
        .map_err(|error| format!("Host command {command} returned an invalid result: {error}"))
}

pub async fn execute_tauri_command<T>(
    app: AppHandle,
    debug_logging_state: DebugLoggingState,
    command_name: HostCommandName,
    args: Value,
) -> Result<T, String>
where
    T: DeserializeOwned,
{
    let runtime = runtime(debug_logging_state.clone());
    let ctx = SidecarContext::new(app, debug_logging_state);
    let request_id = runtime.next_request_id();
    match resolve_command(
        &ctx,
        RpcRequest {
            id: json!(request_id.clone()),
            command: command_name.as_str().to_string(),
            args,
        },
    ) {
        ResolvedSidecarCommandOrResponse::Command(command) => {
            let resolved_command_name = command.name.clone();
            let mut receiver = runtime.writer.register(request_id)?;
            runtime.scheduler.submit(command);
            let response = receiver.recv().await.ok_or_else(|| {
                format!("Host command {resolved_command_name} response channel closed.")
            })?;
            response_to_result(&command_name, response)
        }
        ResolvedSidecarCommandOrResponse::Response(response) => {
            response_to_result(&command_name, response)
        }
    }
}
