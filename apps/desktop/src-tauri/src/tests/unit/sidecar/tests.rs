use super::*;
use crate::test_support::create_temp_dir;
use std::collections::BTreeSet;
use std::fs;
use std::panic;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::time::Duration;
use syn::visit::{self, Visit};
use syn::{
    ExprAwait, ExprCall, ExprMethodCall, File, Item, ItemFn, ItemUse, Macro, Path as SynPath,
    UseTree,
};

fn parse_source(relative_path: &str) -> File {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("src")
        .join(relative_path);
    let source = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
    syn::parse_file(&source)
        .unwrap_or_else(|error| panic!("failed to parse {}: {error}", path.display()))
}

fn find_function<'a>(file: &'a File, name: &str) -> &'a ItemFn {
    file.items
        .iter()
        .find_map(|item| match item {
            Item::Fn(function) if function.sig.ident == name => Some(function),
            _ => None,
        })
        .unwrap_or_else(|| panic!("missing function {name}"))
}

fn path_name(path: &SynPath) -> String {
    path.segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>()
        .join("::")
}

#[derive(Default)]
struct RustStructure {
    calls: BTreeSet<String>,
    imports: BTreeSet<String>,
    macros: Vec<(String, String)>,
    paths: BTreeSet<String>,
    await_count: usize,
}

impl<'ast> Visit<'ast> for RustStructure {
    fn visit_expr_call(&mut self, node: &'ast ExprCall) {
        if let syn::Expr::Path(path) = node.func.as_ref() {
            if let Some(segment) = path.path.segments.last() {
                self.calls.insert(segment.ident.to_string());
            }
        }
        visit::visit_expr_call(self, node);
    }

    fn visit_expr_method_call(&mut self, node: &'ast ExprMethodCall) {
        self.calls.insert(node.method.to_string());
        visit::visit_expr_method_call(self, node);
    }

    fn visit_macro(&mut self, node: &'ast Macro) {
        self.macros.push((
            node.path
                .segments
                .last()
                .expect("macro path should not be empty")
                .ident
                .to_string(),
            node.tokens.to_string().replace(' ', ""),
        ));
        visit::visit_macro(self, node);
    }

    fn visit_item_use(&mut self, node: &'ast ItemUse) {
        fn collect(tree: &UseTree, prefix: &str, imports: &mut BTreeSet<String>) {
            match tree {
                UseTree::Path(path) => {
                    let next = if prefix.is_empty() {
                        path.ident.to_string()
                    } else {
                        format!("{prefix}::{}", path.ident)
                    };
                    collect(&path.tree, &next, imports);
                }
                UseTree::Name(name) => {
                    imports.insert(format!("{prefix}::{}", name.ident));
                }
                UseTree::Rename(rename) => {
                    imports.insert(format!("{prefix}::{}", rename.ident));
                }
                UseTree::Glob(_) => {
                    imports.insert(format!("{prefix}::*"));
                }
                UseTree::Group(group) => {
                    for item in &group.items {
                        collect(item, prefix, imports);
                    }
                }
            }
        }

        collect(&node.tree, "", &mut self.imports);
        visit::visit_item_use(self, node);
    }

    fn visit_path(&mut self, node: &'ast SynPath) {
        self.paths.insert(path_name(node));
        visit::visit_path(self, node);
    }

    fn visit_expr_await(&mut self, node: &'ast ExprAwait) {
        self.await_count += 1;
        visit::visit_expr_await(self, node);
    }
}

fn function_structure(function: &ItemFn) -> RustStructure {
    let mut structure = RustStructure::default();
    structure.visit_block(&function.block);
    structure
}

fn command_lane(command: &str) -> Option<SidecarLane> {
    let ctx = SidecarContext {
        app: AppHandle::sidecar(|_, _| Ok(())),
        debug_logging_state: DebugLoggingState::new(),
    };
    match resolve_command(
        &ctx,
        RpcRequest {
            id: json!(1),
            command: command.to_string(),
            args: Value::Null,
        },
    ) {
        ResolvedSidecarCommandOrResponse::Command(command) => Some(command.lane),
        ResolvedSidecarCommandOrResponse::Response(_) => None,
    }
}

fn command_resources(command: &str) -> Option<Vec<SidecarResource>> {
    let ctx = SidecarContext {
        app: AppHandle::sidecar(|_, _| Ok(())),
        debug_logging_state: DebugLoggingState::new(),
    };
    match resolve_command(
        &ctx,
        RpcRequest {
            id: json!(1),
            command: command.to_string(),
            args: Value::Null,
        },
    ) {
        ResolvedSidecarCommandOrResponse::Command(command) => Some(command.resources),
        ResolvedSidecarCommandOrResponse::Response(_) => None,
    }
}

fn command_has_dynamic_resources(command: &str) -> bool {
    let ctx = SidecarContext {
        app: AppHandle::sidecar(|_, _| Ok(())),
        debug_logging_state: DebugLoggingState::new(),
    };
    match resolve_command(
        &ctx,
        RpcRequest {
            id: json!(1),
            command: command.to_string(),
            args: Value::Null,
        },
    ) {
        ResolvedSidecarCommandOrResponse::Command(command) => command.resource_resolver.is_some(),
        ResolvedSidecarCommandOrResponse::Response(_) => false,
    }
}

fn resolved_dynamic_resources(command: &str, args: Value) -> Vec<SidecarResource> {
    let ctx = SidecarContext {
        app: AppHandle::sidecar(|_, _| Ok(())),
        debug_logging_state: DebugLoggingState::new(),
    };
    let ResolvedSidecarCommandOrResponse::Command(command) = resolve_command(
        &ctx,
        RpcRequest {
            id: json!(1),
            command: command.to_string(),
            args,
        },
    ) else {
        panic!("command should resolve")
    };
    command
        .resource_resolver
        .expect("command should declare a dynamic resource resolver")()
    .expect("dynamic resources should resolve")
}

#[test]
fn resolve_command_declares_lane_at_binding_site() {
    let sidecar = parse_source("sidecar.rs");
    assert!(sidecar.items.iter().all(|item| {
        !matches!(item, Item::Fn(function) if function.sig.ident == "dispatch_mode")
    }));
    let resolver = function_structure(find_function(&sidecar, "resolve_command"));
    assert!(
        resolver
            .macros
            .iter()
            .any(|(name, _)| name == "host_command_wire")
    );
    assert_eq!(
        command_lane("load_launcher_remote_mod_detail"),
        Some(SidecarLane::Network)
    );
    assert_eq!(
        command_lane("save_launcher_library_state"),
        Some(SidecarLane::Mutation)
    );
    assert_eq!(command_lane("scan_launcher_library"), Some(SidecarLane::Io));
    assert_eq!(
        command_lane("cancel_launcher_download"),
        Some(SidecarLane::Control)
    );
    assert_eq!(
        command_lane("print_host_runtime_diagnostics"),
        Some(SidecarLane::Control)
    );
    assert_eq!(
        command_lane("load_launcher_settings"),
        Some(SidecarLane::Mutation)
    );
    assert_eq!(
        command_lane("load_app_ui_state"),
        Some(SidecarLane::Mutation)
    );
}

#[test]
fn sidecar_uses_shared_host_runtime_scheduler() {
    let sidecar = parse_source("sidecar.rs");
    let host_runtime = parse_source("host_runtime.rs");
    let tauri_runtime = parse_source("commands/runtime.rs");
    assert!(sidecar.items.iter().any(|item| matches!(
        item,
        Item::Type(alias)
            if alias.ident == "SidecarScheduler"
                && matches!(alias.ty.as_ref(), syn::Type::Path(path) if path.path.segments.last().is_some_and(|segment| segment.ident == "HostCommandScheduler"))
    )));
    assert!(host_runtime.items.iter().any(|item| matches!(
        item,
        Item::Struct(item) if item.ident == "HostCommandScheduler"
    )));
    assert!(tauri_runtime.items.iter().any(|item| matches!(
        item,
        Item::Struct(item) if item.ident == "TauriCommandRuntime"
    )));
    let run_stdio = function_structure(find_function(&sidecar, "run_stdio"));
    assert!(run_stdio.calls.contains("new"));
    assert!(run_stdio.calls.contains("submit"));
}

#[test]
fn tauri_command_wrappers_route_through_host_runtime() {
    for name in [
        "app_ui",
        "assets",
        "audio",
        "content_patcher",
        "cp_maker",
        "launcher",
        "logging",
        "mods",
        "resource_registry",
        "saves",
    ] {
        let file = parse_source(&format!("commands/{name}.rs"));
        let wrappers = file.items.iter().filter_map(|item| match item {
            Item::Fn(function)
                if function
                    .attrs
                    .iter()
                    .any(|attribute| path_name(attribute.path()) == "tauri::command") =>
            {
                Some(function)
            }
            _ => None,
        });
        let mut wrapper_count = 0;
        for wrapper in wrappers {
            wrapper_count += 1;
            assert!(
                wrapper.sig.asyncness.is_some(),
                "{name}::{} must be async",
                wrapper.sig.ident
            );
            assert!(matches!(wrapper.vis, syn::Visibility::Public(_)));
            let structure = function_structure(wrapper);
            assert!(structure.calls.contains("execute_tauri_command"));
            assert!(!structure.calls.contains("log_tauri_command_error"));
            assert!(structure.macros.iter().any(|(macro_name, tokens)| {
                macro_name == "host_command_name" && tokens == &wrapper.sig.ident.to_string()
            }));
        }
        assert!(wrapper_count > 0, "{name} has no Tauri command wrappers");
    }
}

fn command_execution_pool(command: &str) -> Option<HostCommandExecutionPool> {
    let ctx = SidecarContext {
        app: AppHandle::sidecar(|_, _| Ok(())),
        debug_logging_state: DebugLoggingState::new(),
    };
    match resolve_command(
        &ctx,
        RpcRequest {
            id: json!(1),
            command: command.to_string(),
            args: Value::Null,
        },
    ) {
        ResolvedSidecarCommandOrResponse::Command(command) => Some(command.execution_pool),
        ResolvedSidecarCommandOrResponse::Response(_) => None,
    }
}

#[test]
fn tauri_host_runtime_waits_on_async_response_channel() {
    let runtime = parse_source("commands/runtime.rs");
    let execute = function_structure(find_function(&runtime, "execute_tauri_command"));
    assert!(execute.calls.contains("recv"));
    assert!(execute.calls.contains("submit"));
    assert!(execute.await_count > 0);
    assert!(!execute.calls.contains("spawn_blocking"));
    let mut runtime_structure = RustStructure::default();
    runtime_structure.visit_file(&runtime);
    assert!(
        runtime_structure
            .imports
            .iter()
            .any(|path| path.starts_with("tauri::async_runtime::"))
    );
}

#[test]
fn launcher_image_cdn_has_dedicated_host_pool() {
    let config = SidecarSchedulerConfig::default();
    assert_eq!(config.control_max_concurrency, 16);
    assert_eq!(config.network_max_concurrency, 32);
    assert_eq!(
        config.launcher_image_cdn_max_concurrency,
        crate::domain::nexusmods::endpoints::IMAGE_CDN_DEFAULT_CONCURRENCY
    );
    assert_eq!(
        command_execution_pool("resolve_launcher_image"),
        Some(HostCommandExecutionPool::LauncherImageCdn)
    );
    assert_eq!(
        command_execution_pool("load_launcher_remote_mod_detail"),
        Some(HostCommandExecutionPool::Lane)
    );
}

#[test]
fn sidecar_protocol_names_are_derived_from_command_functions() {
    let sidecar = parse_source("sidecar.rs");
    let resolver = function_structure(find_function(&sidecar, "resolve_command"));
    let wire_names = resolver
        .macros
        .iter()
        .filter_map(|(name, tokens)| (name == "host_command_wire").then_some(tokens.clone()))
        .collect::<BTreeSet<_>>();
    assert!(!wire_names.is_empty());

    let mut wrapper_names = BTreeSet::new();
    for name in [
        "app_ui",
        "assets",
        "audio",
        "content_patcher",
        "cp_maker",
        "launcher",
        "logging",
        "mods",
        "resource_registry",
        "saves",
    ] {
        let file = parse_source(&format!("commands/{name}.rs"));
        for item in file.items {
            if let Item::Fn(function) = item
                && function
                    .attrs
                    .iter()
                    .any(|attribute| path_name(attribute.path()) == "tauri::command")
            {
                wrapper_names.insert(function.sig.ident.to_string());
            }
        }
    }

    assert_eq!(wire_names, wrapper_names);
}

#[test]
fn sidecar_resolver_does_not_call_tauri_command_wrappers() {
    let sidecar = parse_source("sidecar.rs");
    let resolver = function_structure(find_function(&sidecar, "resolve_command"));
    assert!(
        resolver
            .paths
            .iter()
            .all(|path| !path.starts_with("crate::commands"))
    );
}

#[test]
fn sidecar_resolver_avoids_async_domain_wrappers_that_spawn_blocking() {
    let sidecar = parse_source("sidecar.rs");
    let resolver = function_structure(find_function(&sidecar, "resolve_command"));
    assert!(!resolver.calls.contains("block_on"));
    for expected in [
        "persist_launcher_library_remote_cover_blocking",
        "search_launcher_catalog_blocking",
        "load_launcher_remote_mod_detail_blocking",
        "load_launcher_update_changelog_blocking",
        "resolve_cached_launcher_image_blocking",
        "check_launcher_updates_blocking",
    ] {
        assert!(
            resolver.calls.contains(expected),
            "sidecar should call {expected} directly"
        );
    }
}

#[test]
fn download_cancel_is_control() {
    assert_eq!(
        command_lane("download_launcher_mod"),
        Some(SidecarLane::Network)
    );
    assert_eq!(
        command_lane("cancel_launcher_download"),
        Some(SidecarLane::Control)
    );
    assert_eq!(command_resources("download_launcher_mod"), Some(vec![]));
    assert_eq!(command_resources("cancel_launcher_download"), Some(vec![]));
}

#[test]
fn mutable_cache_commands_declare_resource_locks_at_binding_site() {
    assert_eq!(command_resources("check_launcher_updates"), Some(vec![]));
    assert_eq!(command_resources("resolve_launcher_image"), Some(vec![]));
    assert_eq!(
        command_resources("clear_launcher_image_cache"),
        Some(vec![SidecarResource::LauncherImageCache])
    );
    assert_eq!(
        command_resources("record_launcher_image_failure"),
        Some(vec![SidecarResource::LauncherImageCache])
    );
    assert_eq!(
        command_lane("persist_launcher_library_remote_cover"),
        Some(SidecarLane::Network)
    );
    assert_eq!(
        command_resources("persist_launcher_library_remote_cover"),
        Some(vec![])
    );
    assert_eq!(
        command_resources("load_app_ui_state"),
        Some(vec![SidecarResource::AppUiState])
    );
    assert_eq!(
        command_resources("patch_app_ui_state"),
        Some(vec![SidecarResource::AppUiState])
    );
}

#[test]
fn launcher_mod_config_commands_declare_lane_and_resource_locks_at_binding_site() {
    assert_eq!(
        command_lane("load_launcher_mod_config"),
        Some(SidecarLane::Io)
    );
    assert_eq!(command_resources("load_launcher_mod_config"), Some(vec![]));
    assert_eq!(
        command_lane("save_launcher_mod_config"),
        Some(SidecarLane::Mutation)
    );
    assert_eq!(
        command_resources("save_launcher_mod_config"),
        Some(vec![SidecarResource::LauncherModConfig])
    );
}

#[test]
fn project_and_cp_maker_mutations_declare_resource_locks_at_binding_site() {
    assert_eq!(
        command_lane("save_mod_i18n_files"),
        Some(SidecarLane::Mutation)
    );
    assert_eq!(command_resources("save_mod_i18n_files"), Some(vec![]));
    assert!(command_has_dynamic_resources("save_mod_i18n_files"));
    assert_eq!(
        command_resources("save_cp_maker_draft"),
        Some(vec![SidecarResource::CpMakerDrafts])
    );
    assert_eq!(command_lane("load_cp_maker_session"), Some(SidecarLane::Io));
    assert_eq!(
        command_resources("load_cp_maker_session"),
        Some(vec![SidecarResource::CpMakerDrafts])
    );
    assert_eq!(
        command_lane("save_cp_maker_session"),
        Some(SidecarLane::Mutation)
    );
    assert_eq!(
        command_resources("save_cp_maker_session"),
        Some(vec![SidecarResource::CpMakerDrafts])
    );
    assert_eq!(
        command_resources("copy_cp_maker_draft"),
        Some(vec![SidecarResource::CpMakerDrafts])
    );
    assert_eq!(
        command_resources("export_cp_maker_pack"),
        Some(vec![SidecarResource::ModProject])
    );
    assert_eq!(command_resources("import_cp_maker_pack"), Some(vec![]));
    assert_eq!(command_lane("export_map_png"), Some(SidecarLane::Mutation));
    assert_eq!(
        command_resources("export_map_png"),
        Some(vec![SidecarResource::MapPngExport])
    );
    assert_eq!(command_lane("export_file"), Some(SidecarLane::Mutation));
    assert_eq!(
        command_resources("export_file"),
        Some(vec![SidecarResource::FileExport])
    );
}

#[test]
fn mod_i18n_save_resources_are_keyed_by_canonical_project_root() {
    let temp = create_temp_dir("sidecar-mod-i18n-resource");
    let first = temp.join("first");
    let second = temp.join("second");
    std::fs::create_dir_all(&first).expect("first project directory should be created");
    std::fs::create_dir_all(&second).expect("second project directory should be created");
    std::fs::write(first.join("manifest.json"), "{}").expect("first manifest should be written");
    std::fs::write(second.join("manifest.json"), "{}").expect("second manifest should be written");

    let resources_for = |path: &std::path::Path| {
        resolved_dynamic_resources(
            "save_mod_i18n_files",
            json!({
                "request": {
                    "sourcePath": path.to_string_lossy(),
                    "i18nFiles": [],
                }
            }),
        )
    };

    let canonical = resources_for(&first);
    assert_eq!(canonical, resources_for(&first.join(".")));
    assert_ne!(canonical, resources_for(&second));
    assert!(matches!(
        canonical.as_slice(),
        [SidecarResource::ModProjectRoot(_)]
    ));
    let _ = std::fs::remove_dir_all(temp);
}

struct TestResponseWriter {
    completed: Mutex<mpsc::SyncSender<RpcResponse>>,
}

impl HostCommandResponseWriter for TestResponseWriter {
    fn write_response(&self, response: &RpcResponse) -> Result<(), String> {
        self.completed
            .lock()
            .map_err(|_| "test response writer lock poisoned".to_string())?
            .try_send(response.clone())
            .map_err(|error| format!("test response send failed: {error}"))
    }
}

struct TestSchedulerHarness {
    scheduler: SidecarScheduler,
    completed: mpsc::Receiver<RpcResponse>,
}

struct FailingResponseWriter;

impl HostCommandResponseWriter for FailingResponseWriter {
    fn write_response(&self, _response: &RpcResponse) -> Result<(), String> {
        Err("simulated writer failure".to_string())
    }
}

fn test_config(
    control_max_concurrency: usize,
    network_max_concurrency: usize,
    io_max_concurrency: usize,
    mutation_max_concurrency: usize,
    pool_queue_capacity: usize,
) -> SidecarSchedulerConfig {
    SidecarSchedulerConfig {
        control_max_concurrency,
        network_max_concurrency,
        io_max_concurrency,
        mutation_max_concurrency,
        launcher_image_cdn_max_concurrency: SidecarSchedulerConfig::default()
            .launcher_image_cdn_max_concurrency,
        pool_queue_capacity,
    }
}

impl TestSchedulerHarness {
    fn new(config: SidecarSchedulerConfig) -> Self {
        let (completed_tx, completed_rx) = mpsc::sync_channel(128);
        let writer = Arc::new(TestResponseWriter {
            completed: Mutex::new(completed_tx),
        });
        let resources = Arc::new(SidecarResourceLocks::new());
        let debug_logging_state = DebugLoggingState::new();
        debug_logging_state.set_enabled(true);
        let scheduler = SidecarScheduler::new(writer, resources, config, debug_logging_state);
        Self {
            scheduler,
            completed: completed_rx,
        }
    }

    fn submit(&self, command: ResolvedSidecarCommand) {
        self.scheduler.submit(command);
    }

    fn recv(&self) -> RpcResponse {
        self.completed
            .recv_timeout(Duration::from_secs(1))
            .expect("test command should complete")
    }

    fn assert_no_completion(&self) {
        assert!(
            self.completed
                .recv_timeout(Duration::from_millis(150))
                .is_err(),
            "no command should complete yet"
        );
    }

    fn diagnostics_summary(&self) -> String {
        self.scheduler
            .diagnostics_summary("test")
            .expect("debug-enabled test scheduler should produce diagnostics")
            .summary
    }
}

fn create_test_command(
    lane: SidecarLane,
    name: &str,
    resources: &'static [SidecarResource],
    run: impl FnOnce() -> DispatchResult + Send + 'static,
) -> ResolvedSidecarCommand {
    create_test_command_on_pool(HostCommandExecutionPool::Lane, lane, name, resources, run)
}

fn create_test_command_on_pool(
    execution_pool: HostCommandExecutionPool,
    lane: SidecarLane,
    name: &str,
    resources: &'static [SidecarResource],
    run: impl FnOnce() -> DispatchResult + Send + 'static,
) -> ResolvedSidecarCommand {
    ResolvedSidecarCommand {
        id: json!(name),
        name: name.to_string(),
        lane,
        execution_pool,
        resources: resources.to_vec(),
        resource_resolver: None,
        cancel_policy: HostCommandCancelPolicy::NotCancellable,
        mutation_policy: if resources.is_empty() {
            HostCommandMutationPolicy::Concurrent
        } else {
            HostCommandMutationPolicy::ExclusiveResources
        },
        submitted_at: Instant::now(),
        record_telemetry: false,
        run: Box::new(move |_| run()),
    }
}

struct PanicHookGuard {
    hook: Option<Box<dyn Fn(&panic::PanicHookInfo<'_>) + Sync + Send + 'static>>,
}

impl PanicHookGuard {
    fn silence() -> Self {
        let hook = panic::take_hook();
        panic::set_hook(Box::new(|_| {}));
        Self { hook: Some(hook) }
    }
}

impl Drop for PanicHookGuard {
    fn drop(&mut self) {
        if let Some(hook) = self.hook.take() {
            panic::set_hook(hook);
        }
    }
}

#[test]
fn network_flood_does_not_delay_control() {
    let scheduler = TestSchedulerHarness::new(test_config(1, 1, 1, 1, 8));
    let (network_started_tx, network_started_rx) = mpsc::channel();
    let (release_network_tx, release_network_rx) = mpsc::channel();
    scheduler.submit(create_test_command(
        SidecarLane::Network,
        "network",
        NO_RESOURCES,
        move || {
            network_started_tx
                .send(())
                .expect("network should signal start");
            release_network_rx
                .recv()
                .expect("network should be released");
            Ok(Value::Null)
        },
    ));
    network_started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("network command should start");
    scheduler.submit(create_test_command(
        SidecarLane::Control,
        "control",
        NO_RESOURCES,
        || Ok(Value::Null),
    ));
    let response = scheduler.recv();
    assert_eq!(response.id, json!("control"));
    assert!(response.ok);
    release_network_tx
        .send(())
        .expect("network command should be releasable");
    let response = scheduler.recv();
    assert_eq!(response.id, json!("network"));
    assert!(response.ok);
}

#[test]
fn network_pool_dispatcher_preserves_configured_concurrency() {
    let scheduler = TestSchedulerHarness::new(test_config(1, 2, 1, 1, 8));
    let active = Arc::new(AtomicUsize::new(0));
    let max_active = Arc::new(AtomicUsize::new(0));
    let (started_tx, started_rx) = mpsc::channel();
    let (release_a_tx, release_a_rx) = mpsc::channel();
    let (release_b_tx, release_b_rx) = mpsc::channel();

    for (name, release_rx) in [("network-a", release_a_rx), ("network-b", release_b_rx)] {
        let active = Arc::clone(&active);
        let max_active = Arc::clone(&max_active);
        let started_tx = started_tx.clone();
        scheduler.submit(create_test_command(
            SidecarLane::Network,
            name,
            NO_RESOURCES,
            move || {
                let current = active.fetch_add(1, Ordering::SeqCst) + 1;
                max_active.fetch_max(current, Ordering::SeqCst);
                started_tx.send(()).expect("network should signal start");
                release_rx.recv().expect("network should be released");
                active.fetch_sub(1, Ordering::SeqCst);
                Ok(Value::Null)
            },
        ));
    }

    started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("first network command should start");
    started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("second network command should start concurrently");
    assert_eq!(max_active.load(Ordering::SeqCst), 2);

    release_a_tx.send(()).expect("first command should release");
    release_b_tx
        .send(())
        .expect("second command should release");
    let completed = [scheduler.recv().id, scheduler.recv().id];
    assert!(completed.contains(&json!("network-a")));
    assert!(completed.contains(&json!("network-b")));
}

#[test]
fn launcher_image_cdn_pool_does_not_share_network_lane_workers() {
    let scheduler = TestSchedulerHarness::new(SidecarSchedulerConfig {
        launcher_image_cdn_max_concurrency: 1,
        ..test_config(1, 1, 1, 1, 8)
    });
    let (network_started_tx, network_started_rx) = mpsc::channel();
    let (release_network_tx, release_network_rx) = mpsc::channel();
    scheduler.submit(create_test_command(
        SidecarLane::Network,
        "blocked-network",
        NO_RESOURCES,
        move || {
            network_started_tx
                .send(())
                .expect("network should signal start");
            release_network_rx
                .recv()
                .expect("network command should be released");
            Ok(Value::Null)
        },
    ));
    network_started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("network command should start");

    let (cover_started_tx, cover_started_rx) = mpsc::channel();
    scheduler.submit(create_test_command_on_pool(
        HostCommandExecutionPool::LauncherImageCdn,
        SidecarLane::Network,
        "cover",
        NO_RESOURCES,
        move || {
            cover_started_tx
                .send(())
                .expect("cover should signal start");
            Ok(Value::Null)
        },
    ));
    cover_started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("cover command should start on the dedicated CDN pool");
    let response = scheduler.recv();
    assert_eq!(response.id, json!("cover"));
    assert!(response.ok);

    release_network_tx
        .send(())
        .expect("network command should be releasable");
    let response = scheduler.recv();
    assert_eq!(response.id, json!("blocked-network"));
    assert!(response.ok);
}

#[test]
fn network_flood_does_not_delay_io() {
    let scheduler = TestSchedulerHarness::new(test_config(1, 1, 1, 1, 8));
    let (network_started_tx, network_started_rx) = mpsc::channel();
    let (release_network_tx, release_network_rx) = mpsc::channel();
    scheduler.submit(create_test_command(
        SidecarLane::Network,
        "network",
        NO_RESOURCES,
        move || {
            network_started_tx
                .send(())
                .expect("network should signal start");
            release_network_rx
                .recv()
                .expect("network should be released");
            Ok(Value::Null)
        },
    ));
    network_started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("network command should start");
    scheduler.submit(create_test_command(
        SidecarLane::Io,
        "io",
        NO_RESOURCES,
        || Ok(Value::Null),
    ));
    let response = scheduler.recv();
    assert_eq!(response.id, json!("io"));
    assert!(response.ok);
    release_network_tx
        .send(())
        .expect("network command should be releasable");
    let response = scheduler.recv();
    assert_eq!(response.id, json!("network"));
    assert!(response.ok);
}

#[test]
fn same_resource_commands_do_not_overlap_across_lanes() {
    let scheduler = TestSchedulerHarness::new(test_config(1, 1, 1, 1, 8));
    let active = Arc::new(AtomicUsize::new(0));
    let max_active = Arc::new(AtomicUsize::new(0));
    let (network_entered_tx, network_entered_rx) = mpsc::channel();
    let (release_network_tx, release_network_rx) = mpsc::channel();
    let network_active = Arc::clone(&active);
    let network_max_active = Arc::clone(&max_active);
    scheduler.submit(create_test_command(
        SidecarLane::Network,
        "network-cache-write",
        &[SidecarResource::LauncherImageCache],
        move || {
            let current = network_active.fetch_add(1, Ordering::SeqCst) + 1;
            network_max_active.fetch_max(current, Ordering::SeqCst);
            network_entered_tx
                .send(())
                .expect("network command should enter");
            release_network_rx
                .recv()
                .expect("network command should be released");
            network_active.fetch_sub(1, Ordering::SeqCst);
            Ok(Value::Null)
        },
    ));
    network_entered_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("network resource command should start");

    let mutation_active = Arc::clone(&active);
    let mutation_max_active = Arc::clone(&max_active);
    scheduler.submit(create_test_command(
        SidecarLane::Mutation,
        "mutation-cache-clear",
        &[SidecarResource::LauncherImageCache],
        move || {
            let current = mutation_active.fetch_add(1, Ordering::SeqCst) + 1;
            mutation_max_active.fetch_max(current, Ordering::SeqCst);
            mutation_active.fetch_sub(1, Ordering::SeqCst);
            Ok(Value::Null)
        },
    ));
    scheduler.assert_no_completion();
    release_network_tx
        .send(())
        .expect("network command should be releasable");
    assert_eq!(scheduler.recv().id, json!("network-cache-write"));
    assert_eq!(scheduler.recv().id, json!("mutation-cache-clear"));
    assert_eq!(max_active.load(Ordering::SeqCst), 1);
}

#[test]
fn remote_cover_network_work_does_not_delay_library_state_mutation() {
    let scheduler = TestSchedulerHarness::new(test_config(1, 1, 1, 1, 8));
    let (cover_started_tx, cover_started_rx) = mpsc::channel();
    let (release_cover_tx, release_cover_rx) = mpsc::channel();
    scheduler.submit(create_test_command(
        SidecarLane::Network,
        "persist-cover",
        NO_RESOURCES,
        move || {
            cover_started_tx
                .send(())
                .expect("cover command should signal start");
            release_cover_rx
                .recv()
                .expect("cover command should be released");
            Ok(Value::Null)
        },
    ));
    cover_started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("cover command should start");

    scheduler.submit(create_test_command(
        SidecarLane::Mutation,
        "save-library-state",
        &[SidecarResource::LauncherLibraryState],
        || Ok(Value::Null),
    ));
    let response = scheduler.recv();
    assert_eq!(response.id, json!("save-library-state"));
    assert!(response.ok);

    release_cover_tx
        .send(())
        .expect("cover command should be releasable");
    assert_eq!(scheduler.recv().id, json!("persist-cover"));
}

#[test]
fn long_network_launcher_commands_do_not_hold_sidecar_resource_locks() {
    let scheduler = TestSchedulerHarness::new(test_config(1, 2, 1, 1, 8));
    let (download_started_tx, download_started_rx) = mpsc::channel();
    let (release_download_tx, release_download_rx) = mpsc::channel();
    scheduler.submit(create_test_command(
        SidecarLane::Network,
        "download",
        NO_RESOURCES,
        move || {
            download_started_tx
                .send(())
                .expect("download should signal start");
            release_download_rx.recv().expect("download should release");
            Ok(Value::Null)
        },
    ));
    download_started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("download should start");

    scheduler.submit(create_test_command(
        SidecarLane::Mutation,
        "save-settings",
        &[SidecarResource::LauncherSettings],
        || Ok(Value::Null),
    ));
    let response = scheduler.recv();
    assert_eq!(response.id, json!("save-settings"));
    assert!(response.ok);

    let (updates_started_tx, updates_started_rx) = mpsc::channel();
    let (release_updates_tx, release_updates_rx) = mpsc::channel();
    scheduler.submit(create_test_command(
        SidecarLane::Network,
        "check-updates",
        NO_RESOURCES,
        move || {
            updates_started_tx
                .send(())
                .expect("updates should signal start");
            release_updates_rx.recv().expect("updates should release");
            Ok(Value::Null)
        },
    ));
    updates_started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("updates should start");

    scheduler.submit(create_test_command(
        SidecarLane::Mutation,
        "load-updates-cache",
        &[SidecarResource::LauncherUpdatesCache],
        || Ok(Value::Null),
    ));
    let response = scheduler.recv();
    assert_eq!(response.id, json!("load-updates-cache"));
    assert!(response.ok);

    release_download_tx
        .send(())
        .expect("download should be releasable");
    release_updates_tx
        .send(())
        .expect("updates should be releasable");
    let remaining = [scheduler.recv().id, scheduler.recv().id];
    assert!(remaining.contains(&json!("download")));
    assert!(remaining.contains(&json!("check-updates")));
}

#[test]
fn resource_locked_network_command_does_not_delay_control_without_same_resource() {
    let scheduler = TestSchedulerHarness::new(test_config(1, 1, 1, 1, 8));
    let (network_started_tx, network_started_rx) = mpsc::channel();
    let (release_network_tx, release_network_rx) = mpsc::channel();
    scheduler.submit(create_test_command(
        SidecarLane::Network,
        "download",
        &[SidecarResource::LauncherInstallTree],
        move || {
            network_started_tx
                .send(())
                .expect("download should signal start");
            release_network_rx.recv().expect("download should release");
            Ok(Value::Null)
        },
    ));
    network_started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("download should start");
    scheduler.submit(create_test_command(
        SidecarLane::Control,
        "cancel",
        NO_RESOURCES,
        || Ok(Value::Null),
    ));
    let response = scheduler.recv();
    assert_eq!(response.id, json!("cancel"));
    assert!(response.ok);
    release_network_tx
        .send(())
        .expect("download command should be releasable");
    assert_eq!(scheduler.recv().id, json!("download"));
}

#[test]
fn mutation_is_serial() {
    let scheduler = TestSchedulerHarness::new(test_config(
        2,
        1,
        1,
        SidecarSchedulerConfig::default().mutation_max_concurrency,
        8,
    ));
    let active = Arc::new(AtomicUsize::new(0));
    let max_active = Arc::new(AtomicUsize::new(0));
    let (first_entered_tx, first_entered_rx) = mpsc::channel();
    let (release_first_tx, release_first_rx) = mpsc::channel();
    let first_active = Arc::clone(&active);
    let first_max_active = Arc::clone(&max_active);
    scheduler.submit(create_test_command(
        SidecarLane::Mutation,
        "first",
        NO_RESOURCES,
        move || {
            let current = first_active.fetch_add(1, Ordering::SeqCst) + 1;
            first_max_active.fetch_max(current, Ordering::SeqCst);
            first_entered_tx
                .send(())
                .expect("first exclusive dispatch should enter");
            release_first_rx
                .recv()
                .expect("first exclusive dispatch should be released");
            first_active.fetch_sub(1, Ordering::SeqCst);
            Ok(Value::Null)
        },
    ));
    first_entered_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("first mutation should start");

    let second_active = Arc::clone(&active);
    let second_max_active = Arc::clone(&max_active);
    scheduler.submit(create_test_command(
        SidecarLane::Mutation,
        "second",
        NO_RESOURCES,
        move || {
            let current = second_active.fetch_add(1, Ordering::SeqCst) + 1;
            second_max_active.fetch_max(current, Ordering::SeqCst);
            second_active.fetch_sub(1, Ordering::SeqCst);
            Ok(Value::Null)
        },
    ));
    scheduler.assert_no_completion();
    release_first_tx
        .send(())
        .expect("first mutation should be releasable");
    assert_eq!(scheduler.recv().id, json!("first"));
    assert_eq!(scheduler.recv().id, json!("second"));
    assert_eq!(max_active.load(Ordering::SeqCst), 1);
}

#[test]
fn enqueue_failure_returns_error_response_for_request_id() {
    let scheduler = TestSchedulerHarness::new(test_config(1, 1, 1, 1, 1));
    let (first_started_tx, first_started_rx) = mpsc::channel();
    let (release_first_tx, release_first_rx) = mpsc::channel();
    scheduler.submit(create_test_command(
        SidecarLane::Network,
        "first",
        NO_RESOURCES,
        move || {
            first_started_tx.send(()).expect("first should start");
            release_first_rx.recv().expect("first should release");
            Ok(Value::Null)
        },
    ));
    first_started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("first command should start");
    scheduler.submit(create_test_command(
        SidecarLane::Network,
        "queued",
        NO_RESOURCES,
        || Ok(Value::Null),
    ));
    scheduler.submit(create_test_command(
        SidecarLane::Network,
        "rejected",
        NO_RESOURCES,
        || Ok(Value::Null),
    ));
    let response = scheduler.recv();
    assert_eq!(response.id, json!("rejected"));
    assert!(!response.ok);
    assert!(response.error.is_some());
    release_first_tx
        .send(())
        .expect("first command should be releasable");
    assert_eq!(scheduler.recv().id, json!("first"));
    assert_eq!(scheduler.recv().id, json!("queued"));
    let summary = scheduler.diagnostics_summary();
    assert!(summary.contains("HostRuntime stats summary"));
    assert!(summary.contains("Pools"));
    assert!(summary.contains("usage="));
    assert!(summary.contains("jobs="));
    assert!(summary.contains("Network/Lane"));
    assert!(summary.contains("rej=1"));
}

#[test]
fn writer_failure_records_diagnostics_and_releases_active_slot() {
    let debug_logging_state = DebugLoggingState::new();
    debug_logging_state.set_enabled(true);
    let scheduler = SidecarScheduler::new(
        Arc::new(FailingResponseWriter),
        Arc::new(SidecarResourceLocks::new()),
        test_config(1, 1, 1, 1, 8),
        debug_logging_state,
    );
    scheduler.submit(create_test_command(
        SidecarLane::Io,
        "writer-fails",
        NO_RESOURCES,
        || Ok(Value::Null),
    ));

    let deadline = std::time::Instant::now() + Duration::from_secs(1);
    let summary = loop {
        let summary = scheduler
            .diagnostics_summary("test")
            .expect("debug-enabled scheduler should produce diagnostics")
            .summary;
        if summary.contains("writerFailed")
            && summary.contains("Io/Lane")
            && summary.contains("active=0/1")
            && summary.contains("peak=1/1")
            && summary.contains("writerFailed=1")
        {
            break summary;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "writer failure should be reflected in diagnostics: {summary}"
        );
        std::thread::sleep(Duration::from_millis(10));
    };
    assert!(summary.contains("Anomalies"));
}

#[test]
fn panic_returns_error_and_worker_survives() {
    let _panic_hook_guard = PanicHookGuard::silence();
    let scheduler = TestSchedulerHarness::new(test_config(1, 1, 1, 1, 8));
    scheduler.submit(create_test_command(
        SidecarLane::Io,
        "panic",
        NO_RESOURCES,
        || {
            panic!("simulated sidecar panic");
        },
    ));
    scheduler.submit(create_test_command(
        SidecarLane::Io,
        "after",
        NO_RESOURCES,
        || Ok(Value::Null),
    ));
    let response = scheduler.recv();
    assert_eq!(response.id, json!("panic"));
    assert!(!response.ok);
    assert!(response.error.is_some());
    let response = scheduler.recv();
    assert_eq!(response.id, json!("after"));
    assert!(response.ok);
    let summary = scheduler.diagnostics_summary();
    assert!(summary.contains("Anomalies"));
    assert!(summary.contains("Io/Lane"));
    assert!(summary.contains("panicked"));
    assert!(summary.contains("panicked=1"));
    assert!(summary.contains("fail=1"));
}

#[test]
fn telemetry_uses_per_command_sampling_when_debug_changes_mid_run() {
    let debug_logging_state = DebugLoggingState::new();
    let (completed_tx, completed_rx) = mpsc::sync_channel(128);
    let writer = Arc::new(TestResponseWriter {
        completed: Mutex::new(completed_tx),
    });
    let scheduler = SidecarScheduler::new(
        writer,
        Arc::new(SidecarResourceLocks::new()),
        test_config(1, 1, 1, 1, 8),
        debug_logging_state.clone(),
    );
    scheduler.submit(create_test_command(
        SidecarLane::Network,
        "before-debug",
        NO_RESOURCES,
        || Ok(Value::Null),
    ));
    let response = completed_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("first command should complete");
    assert_eq!(response.id, json!("before-debug"));

    debug_logging_state.set_enabled(true);
    scheduler.submit(create_test_command(
        SidecarLane::Network,
        "after-debug",
        NO_RESOURCES,
        || Ok(Value::Null),
    ));
    let response = completed_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("second command should complete");
    assert_eq!(response.id, json!("after-debug"));

    let deadline = std::time::Instant::now() + Duration::from_secs(1);
    let summary = loop {
        let summary = scheduler
            .diagnostics_summary("test")
            .expect("debug-enabled scheduler should produce diagnostics")
            .summary;
        if summary.contains("jobs=1 ok=1") {
            break summary;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "debug-enabled command should keep jobs and ok counts aligned: {summary}"
        );
        std::thread::sleep(Duration::from_millis(10));
    };
    assert!(
        summary.contains("jobs=1 ok=1"),
        "debug-enabled command should keep jobs and ok counts aligned: {summary}"
    );
}
