//! Host layer: sidecar transport, host handle abstraction, and the shared
//! Host Runtime scheduler entry points.

pub mod host_commands;
pub mod host_handle;
pub mod host_runtime;
pub mod plugin_protocol;
pub mod sidecar;

#[cfg(any(debug_assertions, feature = "dev-asset-bridge"))]
pub mod dev_asset_bridge;

pub use host_handle::HostHandle;
