use crate::support::logging::{LogEvent, targets};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::panic::{self, AssertUnwindSafe};

pub type HostCommandResult = Result<Value, Value>;

#[derive(Debug, Clone, Serialize)]
pub struct HostCommandResponse {
    pub id: Value,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Value>,
}

pub trait HostCommandResponseWriter: Send + Sync {
    fn write_response(&self, response: &HostCommandResponse) -> Result<(), String>;
}

fn panic_message(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        return (*message).to_string();
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    "unknown panic payload".to_string()
}

fn dispatch_result_to_response(id: Value, result: HostCommandResult) -> HostCommandResponse {
    match result {
        Ok(result) => HostCommandResponse {
            id,
            ok: true,
            result: Some(result),
            error: None,
        },
        Err(error) => HostCommandResponse {
            id,
            ok: false,
            result: None,
            error: Some(error),
        },
    }
}

pub fn panic_safe_dispatch_response<F>(id: Value, command: &str, dispatch: F) -> HostCommandResponse
where
    F: FnOnce() -> HostCommandResult,
{
    panic_safe_dispatch_outcome(id, command, dispatch).0
}

pub(crate) fn panic_safe_dispatch_outcome<F>(
    id: Value,
    command: &str,
    dispatch: F,
) -> (HostCommandResponse, bool)
where
    F: FnOnce() -> HostCommandResult,
{
    match panic::catch_unwind(AssertUnwindSafe(dispatch)) {
        Ok(result) => (dispatch_result_to_response(id, result), false),
        Err(payload) => {
            let message = panic_message(payload.as_ref());
            LogEvent::new("hostRuntime.command.panicked")
                .field("id", &id)
                .field("command", command)
                .field("panic", &message)
                .emit_error(targets::HOST_RUNTIME);
            (
                HostCommandResponse {
                    id,
                    ok: false,
                    result: None,
                    error: Some(json!(format!(
                        "Host command {command} panicked before returning a response."
                    ))),
                },
                true,
            )
        }
    }
}

pub(crate) fn response_to_result<T>(
    command: &str,
    response: HostCommandResponse,
) -> Result<T, String>
where
    T: DeserializeOwned,
{
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
