//! `plugin://` custom URI scheme handler for the Tauri host. Resolves plugin
//! asset paths via the single Rust source of truth
//! (`compat_plugin::resolve_plugin_protocol_path`), reads the file, and wraps
//! it in an HTTP response with the correct Content-Type and CORS headers.
//! Unsafe paths and missing files return a bare 404 without error details so
//! no filesystem layout leaks to the webview.

use crate::AppRuntime;
use crate::domain;

/// Handles a `plugin://<pluginId>/<relativePath>` request for the custom URI
/// scheme protocol. Resolves the path via
/// [`compat_plugin::resolve_plugin_protocol_path`], reads the file and returns
/// it with the correct Content-Type and CORS headers. Unsafe paths and missing
/// files return a bare 404 without error details.
pub(crate) fn handle_plugin_uri_scheme(
    _ctx: tauri::UriSchemeContext<'_, AppRuntime>,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    // Parse the request URI. Tauri normalises the host across platforms:
    //   macOS/Linux → `plugin://localhost/<pluginId>/<relativePath>`
    //   Windows     → `http://plugin.localhost/<pluginId>/<relativePath>`
    // `url::Url` extracts the path segments uniformly in both cases.
    let request_uri = request.uri().to_string();
    let parsed = match url::Url::parse(&request_uri) {
        Ok(url) => url,
        Err(_) => return plugin_protocol_not_found(),
    };

    let segments: Vec<&str> = parsed
        .path_segments()
        .map(|segments| segments.collect())
        .unwrap_or_default();

    // First segment is the plugin id; the remainder is the relative path.
    if segments.is_empty() {
        return plugin_protocol_not_found();
    }
    let plugin_id = match percent_encoding::percent_decode_str(segments[0]).decode_utf8() {
        Ok(id) => id,
        Err(_) => return plugin_protocol_not_found(),
    };
    let relative_path = segments[1..]
        .iter()
        .map(|segment| {
            percent_encoding::percent_decode_str(segment)
                .decode_utf8_lossy()
                .into_owned()
        })
        .collect::<Vec<_>>()
        .join("/");

    // Strip the hot-reload epoch prefix (`__v<N>/`) before path resolution.
    // The prefix is only inserted by the frontend loader to bypass the webview
    // module cache; it carries no on-disk meaning. Stripping happens before the
    // extension whitelist and traversal checks, so no safety rule is relaxed.
    let relative_path = strip_plugin_epoch_prefix(&relative_path);

    let Some(resolved) =
        domain::modding::compat_plugin::resolve_plugin_protocol_path(&plugin_id, &relative_path)
    else {
        eprintln!(
            "[plugin-protocol] 404 plugin_id={plugin_id} relative_path={relative_path} uri={request_uri}"
        );
        return plugin_protocol_not_found();
    };

    let bytes = match std::fs::read(&resolved) {
        Ok(bytes) => bytes,
        Err(_) => return plugin_protocol_not_found(),
    };

    let content_type = domain::modding::compat_plugin::plugin_asset_content_type(&resolved);

    tauri::http::Response::builder()
        .status(tauri::http::StatusCode::OK)
        .header("Content-Type", content_type)
        .header("Access-Control-Allow-Origin", "*")
        .header("Cache-Control", "no-cache")
        .body(bytes)
        .unwrap_or_else(|_| plugin_protocol_not_found())
}

/// Strips a leading `__v<N>/` hot-reload epoch segment from a plugin relative
/// path. Only an exact `__v` + ASCII-digits segment is stripped; anything else
/// (including forged prefixes like `..__v1__`) is left untouched so the
/// downstream traversal/extension checks reject it as usual.
pub(crate) fn strip_plugin_epoch_prefix(relative_path: &str) -> String {
    let mut segments = relative_path.split('/');
    let Some(first) = segments.next() else {
        return relative_path.to_string();
    };
    if let Some(num) = first.strip_prefix("__v") {
        if !num.is_empty() && num.bytes().all(|b| b.is_ascii_digit()) {
            return segments.collect::<Vec<_>>().join("/");
        }
    }
    relative_path.to_string()
}

/// Returns a bare 404 response for rejected `plugin://` requests. No error
/// details are exposed to avoid leaking filesystem layout information.
fn plugin_protocol_not_found() -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(tauri::http::StatusCode::NOT_FOUND)
        .header("Access-Control-Allow-Origin", "*")
        .body(Vec::new())
        .expect("static 404 response is always constructible")
}
