use reqwest::Url;
use std::path::PathBuf;
use std::sync::mpsc;
use tauri::webview::{PageLoadEvent, WebviewBuilder};
use tauri::window::WindowBuilder;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WindowEvent};

const DEFAULT_CONTROLS_WIDTH: u32 = 300;

#[derive(Clone, Debug)]
pub(crate) struct SplitPaneWebviewLabels {
    pub window: &'static str,
    pub controls: &'static str,
    pub content: &'static str,
}

#[derive(Clone, Debug)]
pub(crate) struct SplitPaneWebviewConfig {
    pub labels: SplitPaneWebviewLabels,
    pub title: &'static str,
    pub content_data_dir_name: &'static str,
    pub content_user_agent: Option<&'static str>,
    pub initial_width: f64,
    pub initial_height: f64,
    pub min_width: f64,
    pub min_height: f64,
    pub controls_width: u32,
}

impl SplitPaneWebviewConfig {
    pub(crate) fn content_data_directory(&self, app: &AppHandle) -> Result<PathBuf, String> {
        let base = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
        Ok(base.join(self.content_data_dir_name))
    }
}

pub(crate) fn run_on_main_thread_sync<T, F>(app: &AppHandle, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let (tx, rx) = mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = tx.send(task());
    })
    .map_err(|error| format!("Failed to schedule webview task: {error}"))?;

    rx.recv()
        .map_err(|error| format!("Failed to receive webview task result: {error}"))?
}

pub(crate) fn hide_split_pane_window(
    app: &AppHandle,
    config: &SplitPaneWebviewConfig,
) -> Result<(), String> {
    log::info!(
        "split pane hide requested window={} controls={} content={}",
        config.labels.window,
        config.labels.controls,
        config.labels.content
    );
    if let Some(window) = app.get_window(config.labels.window) {
        window
            .hide()
            .map_err(|error| format!("Failed to hide split pane window: {error}"))?;
        log::info!("split pane window hidden window={}", config.labels.window);
    } else {
        log::info!(
            "split pane hide skipped missing window={}",
            config.labels.window
        );
    }
    Ok(())
}

fn show_split_pane_window(app: &AppHandle, config: &SplitPaneWebviewConfig) -> Result<(), String> {
    log::info!(
        "split pane show requested window={} controls={} content={}",
        config.labels.window,
        config.labels.controls,
        config.labels.content
    );
    if let Some(window) = app.get_window(config.labels.window) {
        window
            .show()
            .map_err(|error| format!("Failed to show split pane window: {error}"))?;
        window
            .set_focus()
            .map_err(|error| format!("Failed to focus split pane window: {error}"))?;
        log::info!(
            "split pane window shown and focused window={}",
            config.labels.window
        );
    } else {
        log::warn!("split pane show missing window={}", config.labels.window);
    }
    if let Some(controls) = app.get_webview(config.labels.controls) {
        controls
            .show()
            .map_err(|error| format!("Failed to show split pane controls webview: {error}"))?;
        log::info!(
            "split pane controls webview shown label={}",
            config.labels.controls
        );
    } else {
        log::warn!(
            "split pane show missing controls webview label={}",
            config.labels.controls
        );
    }
    if let Some(content) = app.get_webview(config.labels.content) {
        content
            .show()
            .map_err(|error| format!("Failed to show split pane content webview: {error}"))?;
        log::info!(
            "split pane content webview shown label={}",
            config.labels.content
        );
    } else {
        log::warn!(
            "split pane show missing content webview label={}",
            config.labels.content
        );
    }
    Ok(())
}

pub(crate) fn layout_split_pane_window(
    app: &AppHandle,
    config: &SplitPaneWebviewConfig,
) -> Result<(), String> {
    let Some(window) = app.get_window(config.labels.window) else {
        return Ok(());
    };

    let size = window
        .inner_size()
        .map_err(|error| format!("Failed to read split pane window size: {error}"))?;
    let controls_width = config
        .controls_width
        .max(1)
        .min(size.width.saturating_sub(320).max(1));
    let content_width = size.width.saturating_sub(controls_width).max(1);

    if let Some(controls) = app.get_webview(config.labels.controls) {
        controls
            .set_position(PhysicalPosition::new(content_width as i32, 0))
            .map_err(|error| format!("Failed to position split pane controls: {error}"))?;
        controls
            .set_size(PhysicalSize::new(controls_width, size.height))
            .map_err(|error| format!("Failed to size split pane controls: {error}"))?;
    }

    if let Some(content) = app.get_webview(config.labels.content) {
        content
            .set_position(PhysicalPosition::new(0, 0))
            .map_err(|error| format!("Failed to position split pane content: {error}"))?;
        content
            .set_size(PhysicalSize::new(content_width, size.height))
            .map_err(|error| format!("Failed to size split pane content: {error}"))?;
    }

    Ok(())
}

pub(crate) fn ensure_split_pane_window<F, G, H>(
    app: &AppHandle,
    config: SplitPaneWebviewConfig,
    content_url: String,
    on_page_finished: F,
    on_title_changed: G,
    on_close_requested: H,
) -> Result<(), String>
where
    F: Fn(AppHandle, String) + Send + Sync + 'static,
    G: Fn(AppHandle, String) + Send + Sync + 'static,
    H: Fn(AppHandle) + Send + Sync + 'static,
{
    let app_handle = app.clone();

    run_on_main_thread_sync(app, move || {
        log::info!(
            "split pane ensure started window={} controls={} content={} url={}",
            config.labels.window,
            config.labels.controls,
            config.labels.content,
            content_url
        );
        let (window, created_window) = match app_handle.get_window(config.labels.window) {
            Some(window) => {
                log::info!("split pane reusing window={}", config.labels.window);
                (window, false)
            }
            None => (
                {
                    log::info!("split pane creating window={}", config.labels.window);
                    WindowBuilder::new(&app_handle, config.labels.window)
                        .title(config.title)
                        .inner_size(config.initial_width, config.initial_height)
                        .min_inner_size(config.min_width, config.min_height)
                        .center()
                        .visible(false)
                        .focused(false)
                        .build()
                        .map_err(|error| format!("Failed to create split pane window: {error}"))?
                },
                true,
            ),
        };

        if app_handle.get_webview(config.labels.controls).is_none() {
            log::info!(
                "split pane creating controls webview label={}",
                config.labels.controls
            );
            let controls_builder = WebviewBuilder::new(
                config.labels.controls,
                tauri::WebviewUrl::App("index.html".into()),
            );
            window
                .add_child(
                    controls_builder,
                    PhysicalPosition::new(
                        config.initial_width as i32 - config.controls_width as i32,
                        0,
                    ),
                    PhysicalSize::new(
                        config.controls_width.max(DEFAULT_CONTROLS_WIDTH),
                        config.initial_height as u32,
                    ),
                )
                .map_err(|error| format!("Failed to add split pane controls webview: {error}"))?;
        } else {
            log::info!(
                "split pane reusing controls webview label={}",
                config.labels.controls
            );
        }

        if app_handle.get_webview(config.labels.content).is_none() {
            log::info!(
                "split pane creating content webview label={} url={}",
                config.labels.content,
                content_url
            );
            let external_url = Url::parse(&content_url)
                .map_err(|error| format!("Failed to parse split pane content URL: {error}"))?;
            let app_for_page_load = app_handle.clone();
            let app_for_title_change = app_handle.clone();
            let content_width = config.initial_width as u32 - config.controls_width;
            let mut content_builder = WebviewBuilder::new(
                config.labels.content,
                tauri::WebviewUrl::External(external_url),
            )
            .data_directory(config.content_data_directory(&app_handle)?)
            .on_page_load(move |_webview, payload| {
                if payload.event() == PageLoadEvent::Finished {
                    on_page_finished(app_for_page_load.clone(), payload.url().to_string());
                }
            })
            .on_document_title_changed(move |_webview, title| {
                on_title_changed(app_for_title_change.clone(), title);
            });
            if let Some(user_agent) = config.content_user_agent {
                content_builder = content_builder.user_agent(user_agent);
            }
            window
                .add_child(
                    content_builder,
                    PhysicalPosition::new(0, 0),
                    PhysicalSize::new(content_width, config.initial_height as u32),
                )
                .map_err(|error| format!("Failed to add split pane content webview: {error}"))?;
        } else if let Some(content) = app_handle.get_webview(config.labels.content) {
            log::info!(
                "split pane navigating existing content webview label={} url={}",
                config.labels.content,
                content_url
            );
            let url = Url::parse(&content_url)
                .map_err(|error| format!("Failed to parse split pane content URL: {error}"))?;
            content
                .navigate(url)
                .map_err(|error| format!("Failed to navigate split pane content: {error}"))?;
            content
                .reload()
                .map_err(|error| format!("Failed to reload split pane content: {error}"))?;
            log::info!(
                "split pane reloaded existing content webview label={}",
                config.labels.content
            );
        }

        if created_window {
            let window_for_events = window.clone();
            let app_for_events = app_handle.clone();
            let config_for_events = config.clone();
            window.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { api, .. } => {
                    log::info!(
                        "split pane close requested window={}",
                        config_for_events.labels.window
                    );
                    api.prevent_close();
                    let _ = window_for_events.hide();
                    on_close_requested(app_for_events.clone());
                }
                WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
                    let _ = layout_split_pane_window(&app_for_events, &config_for_events);
                }
                _ => {}
            });
        }

        layout_split_pane_window(&app_handle, &config)?;
        show_split_pane_window(&app_handle, &config)?;
        Ok(())
    })
}
