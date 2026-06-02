use crate::AppRuntime;
use serde::Serialize;
use serde_json::Value;
use std::sync::Arc;
use tauri::ipc::{CommandArg, CommandItem, InvokeError};
use tauri::{Emitter, Manager};

type SidecarEventSink = Arc<dyn Fn(&str, Value) -> Result<(), String> + Send + Sync>;

#[derive(Clone)]
enum HostHandleInner {
    Tauri(tauri::AppHandle<AppRuntime>),
    Sidecar(SidecarEventSink),
}

#[derive(Clone)]
pub struct HostHandle {
    inner: HostHandleInner,
}

impl HostHandle {
    pub fn from_tauri(app: tauri::AppHandle<AppRuntime>) -> Self {
        Self {
            inner: HostHandleInner::Tauri(app),
        }
    }

    pub fn sidecar<F>(event_sink: F) -> Self
    where
        F: Fn(&str, Value) -> Result<(), String> + Send + Sync + 'static,
    {
        Self {
            inner: HostHandleInner::Sidecar(Arc::new(event_sink)),
        }
    }

    pub fn emit<T>(&self, event: &str, payload: T) -> Result<(), String>
    where
        T: Serialize + Clone,
    {
        match &self.inner {
            HostHandleInner::Tauri(app) => app
                .emit(event, payload)
                .map_err(|error| format!("Failed to emit host event {event}: {error}")),
            HostHandleInner::Sidecar(event_sink) => {
                let value = serde_json::to_value(payload)
                    .map_err(|error| format!("Failed to serialize host event {event}: {error}"))?;
                event_sink(event, value)
            }
        }
    }
}

impl<'de> CommandArg<'de, AppRuntime> for HostHandle {
    fn from_command(command: CommandItem<'de, AppRuntime>) -> Result<Self, InvokeError> {
        Ok(Self::from_tauri(
            command.message.webview().app_handle().clone(),
        ))
    }
}
