use crate::AppHandle;
use crate::host_commands::HostCommandName;
use crate::host_runtime::{
    HostCommandResourceLocks, HostCommandResponse, HostCommandResponseWriter, HostCommandScheduler,
    HostCommandSchedulerConfig,
};
use crate::sidecar::{
    ResolvedSidecarCommandOrResponse, RpcRequest, SidecarContext, resolve_command,
};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, mpsc};
use tauri::State;

struct TauriCommandResponseWriter {
    pending: Mutex<HashMap<String, mpsc::Sender<HostCommandResponse>>>,
}

impl TauriCommandResponseWriter {
    fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
        }
    }

    fn register(&self, id: String) -> Result<mpsc::Receiver<HostCommandResponse>, String> {
        let (sender, receiver) = mpsc::channel();
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
            .send(response.clone())
            .map_err(|error| format!("Failed to deliver Tauri host command response: {error}"))
    }
}

struct TauriCommandRuntime {
    scheduler: HostCommandScheduler,
    writer: Arc<TauriCommandResponseWriter>,
    next_id: AtomicU64,
}

impl TauriCommandRuntime {
    fn new() -> Self {
        let writer = Arc::new(TauriCommandResponseWriter::new());
        let scheduler = HostCommandScheduler::new(
            writer.clone(),
            Arc::new(HostCommandResourceLocks::new()),
            HostCommandSchedulerConfig::default(),
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

fn runtime() -> &'static TauriCommandRuntime {
    TAURI_COMMAND_RUNTIME.get_or_init(TauriCommandRuntime::new)
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

fn response_to_typed_result<T, E>(
    command: &HostCommandName,
    response: HostCommandResponse,
) -> Result<T, E>
where
    T: DeserializeOwned,
    E: DeserializeOwned + From<String>,
{
    let command = command.as_str();
    if !response.ok {
        let error = response
            .error
            .ok_or_else(|| E::from(format!("Host command {command} failed.")))?;
        return serde_json::from_value(error).map_err(|decode_error| {
            E::from(format!(
                "Host command {command} returned an invalid error payload: {decode_error}"
            ))
        });
    }

    serde_json::from_value(response.result.unwrap_or(Value::Null)).map_err(|error| {
        E::from(format!(
            "Host command {command} returned an invalid result: {error}"
        ))
    })
}

pub fn execute_tauri_command<T>(
    app: AppHandle,
    debug_logging_state: State<'_, crate::support::logging::DebugLoggingState>,
    command_name: HostCommandName,
    args: Value,
) -> Result<T, String>
where
    T: DeserializeOwned,
{
    let ctx = SidecarContext::new(app, debug_logging_state.inner().clone());
    let runtime = runtime();
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
            let receiver = runtime.writer.register(request_id)?;
            runtime.scheduler.submit(command);
            let response = receiver.recv().map_err(|error| {
                format!("Host command {resolved_command_name} response channel closed: {error}")
            })?;
            response_to_result(&command_name, response)
        }
        ResolvedSidecarCommandOrResponse::Response(response) => {
            response_to_result(&command_name, response)
        }
    }
}

pub fn execute_tauri_command_typed_error<T, E>(
    app: AppHandle,
    debug_logging_state: State<'_, crate::support::logging::DebugLoggingState>,
    command_name: HostCommandName,
    args: Value,
) -> Result<T, E>
where
    T: DeserializeOwned,
    E: DeserializeOwned + From<String>,
{
    let ctx = SidecarContext::new(app, debug_logging_state.inner().clone());
    let runtime = runtime();
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
            let receiver = runtime.writer.register(request_id).map_err(E::from)?;
            runtime.scheduler.submit(command);
            let response = receiver.recv().map_err(|error| {
                E::from(format!(
                    "Host command {resolved_command_name} response channel closed: {error}"
                ))
            })?;
            response_to_typed_result(&command_name, response)
        }
        ResolvedSidecarCommandOrResponse::Response(response) => {
            response_to_typed_result(&command_name, response)
        }
    }
}
