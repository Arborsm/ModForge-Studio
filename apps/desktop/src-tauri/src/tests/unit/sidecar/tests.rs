use super::*;
use crate::domain::ai::commands::{
    ApplyAiProfilesImportParams, CancelAiJobParams, ClearAiTranslationCacheParams,
    ExportAiProfilesParams, FetchAiModelsDevCatalogParams, ListAiModelsParams,
    PreviewAiProfilesImportParams, SaveAiSettingsParams, TranslateAiBatchParams,
};
use crate::domain::ai::types::{
    AiProfileImportConflictPolicy, AiProfileRequest, AiTranslateBatchRequest,
    ApplyAiProfilesImportRequest, CancelAiJobRequest, ExportAiProfilesRequest, KnowledgePolicy,
    PreviewAiProfilesImportRequest, SaveAiSettingsRequest,
};
use crate::domain::app_ui::AppUiStatePatch;
use crate::domain::app_ui::commands::{LoadAppUiStateParams, PatchAppUiStateParams};
use crate::domain::assets::commands::{ClearFileCacheParams, ExportFileParams, ExportMapPngParams};
use crate::domain::cp_maker::commands::{
    BuildCpMakerMapAssetParams, CopyCpMakerDraftParams, DeleteCpMakerDraftParams,
    DeleteCpMakerProjectAssetParams, ExportCpMakerPackParams, ImportCpMakerPackParams,
    LoadCpMakerProjectMapAssetParams, LoadCpMakerSessionParams, ReadCpMakerProjectAssetParams,
    RenameCpMakerProjectAssetParams, SaveCpMakerDraftParams, SaveCpMakerSessionParams,
    WriteCpMakerProjectAssetParams,
};
use crate::domain::cp_maker::types::{
    BuildCpMakerMapAssetRequest, CopyCpMakerDraftRequest, CpMakerDraftRecord, CpMakerExportRequest,
    CpMakerMetadata, CpMakerSession, DeleteProjectAssetRequest, ProjectAssetSource,
    ReadProjectAssetRequest, RenameProjectAssetRequest, WriteProjectAssetRequest,
};
use crate::domain::launcher::commands::{
    CancelLauncherDownloadParams, CheckLauncherUpdatesParams, ClearLauncherImageCacheParams,
    DownloadLauncherModParams, LoadLauncherModConfigParams, LoadLauncherRemoteModDetailParams,
    LoadLauncherSettingsParams, PersistLauncherLibraryRemoteCoverParams,
    RecordLauncherImageFailureParams, ResolveLauncherImageParams, SaveLauncherLibraryStateParams,
    SaveLauncherModConfigParams, ScanLauncherLibraryParams,
};
use crate::domain::launcher::types::{
    CheckLauncherUpdatesRequest, DownloadLauncherModRequest, LauncherLibraryScopeMode,
    LauncherLibraryState, LoadLauncherModConfigRequest, LoadLauncherRemoteModDetailRequest,
    PersistLauncherLibraryRemoteCoverRequest, RecordLauncherImageFailureRequest,
    ResolveLauncherImageRequest, SaveLauncherModConfigRequest, ScanLauncherLibraryRequest,
};
use crate::domain::localization::commands::{
    AcquireLocalizationSemanticRuntimeParams, CancelLocalizationJobParams,
    DownloadLocalizationSemanticModelParams, ListLocalizationReviewRunsParams,
    LoadLocalizationReviewRunParams, PrewarmLocalizationCorpusParams,
    ProbeLocalizationSemanticSearchParams, RebuildLocalizationSemanticIndexParams,
    RebuildOfficialLocalizationIndexParams, ReleaseLocalizationSemanticRuntimeParams,
    ReviewLocalizationBatchParams, SearchOfficialLocalizationParams,
    SyncLocalizationSemanticIndexParams, TranslateLocalizationBatchParams,
    UnloadLocalizationSemanticRuntimeParams, UpdateLocalizationReviewIssuesParams,
    VerifyLocalizationSemanticModelParams,
};
use crate::domain::localization::machine_translation::commands::{
    ListMachineTranslationLanguagesParams, LoadMachineTranslationSettingsParams,
    SaveMachineTranslationSettingsParams, TestMachineTranslationProfileParams,
    TranslateMachineTranslationBatchParams,
};
use crate::domain::localization::types::{
    AiReviewRequest, AiSemanticSearchMode, DownloadAiSemanticModelRequest, ListReviewRunsRequest,
    LoadReviewRunRequest, LocalizationEngineRef, LocalizationTranslateBatchRequest,
    MachineTranslateBatchRequest, MachineTranslationProfileRequest, ProbeAiSemanticSearchRequest,
    RebuildAiSemanticIndexRequest, RebuildOfficialLocalizationIndexRequest,
    SaveMachineTranslationSettingsRequest, SearchOfficialLocalizationRequest,
    UpdateReviewIssuesRequest, VerifyAiSemanticModelRequest,
};
use crate::domain::mods::SaveModI18nFilesRequest;
use crate::domain::mods::commands::SaveModI18nFilesParams;
use crate::host_runtime::{DispatchContext, HostCommand};
use crate::host_runtime::{
    HostCommandExecutionPool, HostCommandLane, HostCommandMutationPolicy, HostCommandResource,
    HostCommandResult, ResolvedHostCommand,
};
use crate::infrastructure::game_formats::map::{MapDocument, MapFormat};
use crate::support::logging::commands::PrintHostRuntimeDiagnosticsParams;
use crate::test_support::create_temp_dir;
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::panic;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use syn::visit::{self, Visit};
use syn::{
    ExprAwait, ExprCall, ExprMethodCall, File, Item, ItemFn, ItemUse, Macro, Path as SynPath,
    UseTree,
};

type SidecarResource = HostCommandResource;
const NO_RESOURCES: &[HostCommandResource] = &[];

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

/// Every `commands.rs` binding file under src/, as a src/-relative path.
fn command_source_files() -> Vec<String> {
    fn collect(root: &Path, dir: &Path, out: &mut Vec<String>) {
        for entry in fs::read_dir(dir).expect("read src directory") {
            let entry = entry.expect("directory entry");
            let path = entry.path();
            if path.is_dir() {
                collect(root, &path, out);
            } else if entry.file_name() == "commands.rs" {
                out.push(
                    path.strip_prefix(root)
                        .expect("src-relative path")
                        .to_string_lossy()
                        .replace('\\', "/"),
                );
            }
        }
    }
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut out = Vec::new();
    collect(&root, &root, &mut out);
    out.sort();
    out
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

fn file_structure(file: &File) -> RustStructure {
    let mut structure = RustStructure::default();
    structure.visit_file(file);
    structure
}

fn launcher_library_state() -> LauncherLibraryState {
    LauncherLibraryState {
        storage_folders: vec![],
        hidden_mod_keys: vec![],
        pack_presets: vec![],
        child_mod_groups: vec![],
        library_folders: vec![],
        custom_orders: BTreeMap::new(),
        current_pack_id: None,
        scope_mode: LauncherLibraryScopeMode::All,
    }
}

/// Resolves a typed binding directly (no wire frame) for policy inspection.
fn typed_command_binding<P: HostCommand>(
    params: P,
) -> Option<(
    HostCommandLane,
    HostCommandExecutionPool,
    Vec<SidecarResource>,
)> {
    let ctx = DispatchContext {
        app: AppHandle::sidecar(|_, _| Ok(())),
        debug_logging_state: DebugLoggingState::new(),
    };
    match P::resolve(&ctx, json!(1), params) {
        ResolvedCommandOrResponse::Command(command) => {
            Some((command.lane, command.execution_pool, command.resources))
        }
        ResolvedCommandOrResponse::Response(_) => None,
    }
}

fn typed_command_has_dynamic_resources<P: HostCommand>(params: P) -> bool {
    let ctx = DispatchContext {
        app: AppHandle::sidecar(|_, _| Ok(())),
        debug_logging_state: DebugLoggingState::new(),
    };
    match P::resolve(&ctx, json!(1), params) {
        ResolvedCommandOrResponse::Command(command) => command.resource_resolver.is_some(),
        ResolvedCommandOrResponse::Response(_) => false,
    }
}

/// Asserts a typed binding resolves to the mutation lane with the declared
/// resource locks (used for homogenous assertions across distinct params types).
fn assert_binding_is_mutation_with_resources<P: HostCommand>(
    params: P,
    expected_resources: Vec<SidecarResource>,
) {
    assert_eq!(
        typed_command_binding(params).map(|(lane, _, resources)| (lane, resources)),
        Some((HostCommandLane::Mutation, expected_resources))
    );
}

/// Asserts a typed binding resolves to the mutation lane on a dedicated pool
/// with the declared resource locks.
fn assert_binding_is_mutation_on_pool<P: HostCommand>(
    params: P,
    expected_pool: HostCommandExecutionPool,
    expected_resources: Vec<SidecarResource>,
) {
    assert_eq!(
        typed_command_binding(params).map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((HostCommandLane::Mutation, expected_pool, expected_resources))
    );
}

fn typed_resolved_dynamic_resources<P: HostCommand>(params: P) -> Vec<SidecarResource> {
    let ctx = DispatchContext {
        app: AppHandle::sidecar(|_, _| Ok(())),
        debug_logging_state: DebugLoggingState::new(),
    };
    let ResolvedCommandOrResponse::Command(command) = P::resolve(&ctx, json!(1), params) else {
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
        typed_command_binding(LoadLauncherRemoteModDetailParams {
            request: LoadLauncherRemoteModDetailRequest {
                mod_id: 0,
                include_files: false,
            },
        })
        .map(|(lane, _, _)| lane),
        Some(HostCommandLane::Network)
    );
    assert_eq!(
        typed_command_binding(SaveLauncherLibraryStateParams {
            request: launcher_library_state(),
        })
        .map(|(lane, _, _)| lane),
        Some(HostCommandLane::Mutation)
    );
    assert_eq!(
        typed_command_binding(ScanLauncherLibraryParams {
            request: ScanLauncherLibraryRequest {
                mods_path: String::new(),
            },
        })
        .map(|(lane, _, _)| lane),
        Some(HostCommandLane::Io)
    );
    assert_eq!(
        typed_command_binding(CancelLauncherDownloadParams {
            download_id: String::new(),
        })
        .map(|(lane, _, _)| lane),
        Some(HostCommandLane::Control)
    );
    assert_eq!(
        typed_command_binding(PrintHostRuntimeDiagnosticsParams {}).map(|(lane, _, _)| lane),
        Some(HostCommandLane::Control)
    );
    assert_eq!(
        typed_command_binding(LoadLauncherSettingsParams {}).map(|(lane, _, _)| lane),
        Some(HostCommandLane::Mutation)
    );
    assert_eq!(
        typed_command_binding(LoadAppUiStateParams {}).map(|(lane, _, _)| lane),
        Some(HostCommandLane::Mutation)
    );
}

#[test]
fn sidecar_uses_shared_host_runtime_scheduler() {
    let sidecar = parse_source("sidecar.rs");
    let host_runtime = parse_source("host_runtime.rs");
    assert!(host_runtime.items.iter().any(|item| matches!(
        item,
        Item::Struct(item) if item.ident == "HostCommandScheduler"
    )));
    assert!(host_runtime.items.iter().any(|item| matches!(
        item,
        Item::Struct(item) if item.ident == "TauriCommandRuntime"
    )));
    let run_stdio = function_structure(find_function(&sidecar, "run_stdio"));
    assert!(run_stdio.calls.contains("new"));
    assert!(run_stdio.calls.contains("submit"));
    assert!(
        run_stdio
            .paths
            .iter()
            .any(|path| path.contains("Scheduler"))
    );
    let execute = function_structure(find_function(&host_runtime, "execute"));
    assert!(execute.calls.contains("submit"));
}

#[test]
fn tauri_host_runtime_waits_on_async_response_channel() {
    let runtime = parse_source("host_runtime.rs");
    let execute = function_structure(find_function(&runtime, "execute"));
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
    let config = HostCommandSchedulerConfig::default();
    assert_eq!(config.control_max_concurrency, 16);
    assert_eq!(config.network_max_concurrency, 32);
    assert_eq!(
        config.launcher_image_cdn_max_concurrency,
        crate::domain::nexusmods::endpoints::IMAGE_CDN_DEFAULT_CONCURRENCY
    );
    assert_eq!(
        typed_command_binding(ResolveLauncherImageParams {
            request: ResolveLauncherImageRequest {
                url: String::new(),
                refresh: None,
                mod_key: None,
            },
        })
        .map(|(_, pool, _)| pool),
        Some(HostCommandExecutionPool::LauncherImageCdn)
    );
    assert_eq!(
        typed_command_binding(LoadLauncherRemoteModDetailParams {
            request: LoadLauncherRemoteModDetailRequest {
                mod_id: 0,
                include_files: false,
            },
        })
        .map(|(_, pool, _)| pool),
        Some(HostCommandExecutionPool::Lane)
    );
}

#[test]
fn ai_commands_use_the_dedicated_pool_and_declared_resources() {
    let config = HostCommandSchedulerConfig::default();
    assert_eq!(config.ai_max_concurrency, 2);
    assert_eq!(config.ai_queue_capacity, 64);
    assert_eq!(
        typed_command_binding(TranslateAiBatchParams {
            request: AiTranslateBatchRequest {
                job_id: String::new(),
                profile_id: None,
                source_locale: None,
                target_locale: String::new(),
                items: vec![],
                usage_context: None,
                knowledge_policy: KnowledgePolicy::default(),
                skip_format_validation: false,
                max_batch_bytes: None,
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Network,
            HostCommandExecutionPool::Ai,
            vec![]
        ))
    );
    assert_eq!(
        typed_command_binding(ListAiModelsParams {
            request: AiProfileRequest {
                profile_id: String::new(),
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Network,
            HostCommandExecutionPool::Ai,
            vec![]
        ))
    );
    // models.dev is a public CDN catalog fetch; it uses the general network
    // pool so it never competes with bounded AI translation work.
    assert_eq!(
        typed_command_binding(FetchAiModelsDevCatalogParams {})
            .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Network,
            HostCommandExecutionPool::Lane,
            vec![]
        ))
    );
    assert_eq!(
        typed_command_binding(CancelAiJobParams {
            request: CancelAiJobRequest {
                job_id: String::new(),
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Control,
            HostCommandExecutionPool::Lane,
            vec![]
        ))
    );
    assert_eq!(
        typed_command_binding(SaveAiSettingsParams {
            request: SaveAiSettingsRequest {
                default_profile_id: None,
                profiles: vec![],
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Mutation,
            HostCommandExecutionPool::Lane,
            vec![SidecarResource::AiSettings]
        ))
    );
    assert_eq!(
        typed_command_binding(PreviewAiProfilesImportParams {
            request: PreviewAiProfilesImportRequest {
                source_path: String::new(),
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Io,
            HostCommandExecutionPool::Lane,
            vec![SidecarResource::AiSettings]
        ))
    );
    assert_eq!(
        typed_command_binding(ApplyAiProfilesImportParams {
            request: ApplyAiProfilesImportRequest {
                source_path: String::new(),
                conflict_policy: AiProfileImportConflictPolicy::Overwrite,
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Mutation,
            HostCommandExecutionPool::Lane,
            vec![SidecarResource::AiSettings]
        ))
    );
    assert_eq!(
        typed_command_binding(ExportAiProfilesParams {
            request: ExportAiProfilesRequest {
                destination_path: String::new(),
                profile_ids: vec![],
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Io,
            HostCommandExecutionPool::Lane,
            vec![SidecarResource::AiSettings, SidecarResource::FileExport]
        ))
    );
    assert_eq!(
        typed_command_binding(ClearAiTranslationCacheParams {})
            .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Mutation,
            HostCommandExecutionPool::Lane,
            vec![SidecarResource::AiTranslationCache]
        ))
    );
}

#[test]
fn official_localization_index_has_an_isolated_mutation_pool() {
    let config = HostCommandSchedulerConfig::default();
    assert_eq!(config.ai_official_indexing_queue_capacity, 8);
    assert_eq!(
        typed_command_binding(RebuildOfficialLocalizationIndexParams {
            request: RebuildOfficialLocalizationIndexRequest {
                job_id: String::new(),
                game_directory: String::new(),
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Mutation,
            HostCommandExecutionPool::AiOfficialIndexing,
            vec![SidecarResource::AiOfficialLocalizationIndex],
        ))
    );
    assert_eq!(
        typed_command_binding(SearchOfficialLocalizationParams {
            request: SearchOfficialLocalizationRequest {
                source_locale: String::new(),
                target_locale: String::new(),
                query: String::new(),
                asset_category: None,
                unit_kind: None,
                prompt_eligible_only: false,
                allow_literal_scan: false,
                offset: 0,
                limit: 0,
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Io,
            HostCommandExecutionPool::Lane,
            vec![SidecarResource::AiOfficialLocalizationIndex],
        ))
    );
    assert_eq!(
        typed_command_binding(CancelLocalizationJobParams {
            job_id: String::new(),
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Control,
            HostCommandExecutionPool::Lane,
            vec![]
        ))
    );
}

#[test]
fn machine_translation_commands_use_host_runtime_policies() {
    assert_eq!(
        typed_command_binding(LoadMachineTranslationSettingsParams {})
            .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Io,
            HostCommandExecutionPool::Lane,
            vec![SidecarResource::MachineTranslationSettings]
        ))
    );
    assert_eq!(
        typed_command_binding(SaveMachineTranslationSettingsParams {
            request: SaveMachineTranslationSettingsRequest {
                default_profile_id: None,
                profiles: vec![],
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Mutation,
            HostCommandExecutionPool::Lane,
            vec![SidecarResource::MachineTranslationSettings]
        ))
    );
    assert_eq!(
        typed_command_binding(ListMachineTranslationLanguagesParams {
            request: MachineTranslationProfileRequest {
                profile_id: String::new(),
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Network,
            HostCommandExecutionPool::Lane,
            vec![]
        ))
    );
    assert_eq!(
        typed_command_binding(TestMachineTranslationProfileParams {
            request: MachineTranslationProfileRequest {
                profile_id: String::new(),
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Network,
            HostCommandExecutionPool::Ai,
            vec![]
        ))
    );
    assert_eq!(
        typed_command_binding(TranslateMachineTranslationBatchParams {
            request: MachineTranslateBatchRequest {
                job_id: String::new(),
                profile_id: None,
                source_locale: None,
                target_locale: String::new(),
                items: vec![],
                usage_context: None,
                knowledge_policy: KnowledgePolicy::default(),
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Network,
            HostCommandExecutionPool::Ai,
            vec![]
        ))
    );
}

#[test]
fn localization_review_releases_knowledge_lock_before_ai_network_work() {
    assert_eq!(
        typed_command_binding(TranslateLocalizationBatchParams {
            request: LocalizationTranslateBatchRequest {
                job_id: String::new(),
                engine: LocalizationEngineRef {
                    kind: String::new(),
                    profile_id: String::new(),
                },
                source_locale: None,
                target_locale: String::new(),
                items: vec![],
                usage_context: None,
                knowledge_policy: KnowledgePolicy::default(),
                max_batch_bytes: None,
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Network,
            HostCommandExecutionPool::Ai,
            vec![]
        ))
    );
    assert_eq!(
        typed_command_binding(ReviewLocalizationBatchParams {
            request: AiReviewRequest {
                job_id: String::new(),
                scope_id: String::new(),
                source_locale: String::new(),
                target_locale: String::new(),
                mode: String::new(),
                profile_id: None,
                run_ai: false,
                engine: String::new(),
                items: vec![],
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Network,
            HostCommandExecutionPool::Ai,
            vec![]
        ))
    );
    assert_eq!(
        typed_command_binding(ListLocalizationReviewRunsParams {
            request: ListReviewRunsRequest {
                scope_id: String::new(),
                offset: 0,
                limit: 0,
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Io,
            HostCommandExecutionPool::Lane,
            vec![SidecarResource::AiLocalizationKnowledge]
        ))
    );
    assert_eq!(
        typed_command_binding(LoadLocalizationReviewRunParams {
            request: LoadReviewRunRequest {
                run_id: String::new(),
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Io,
            HostCommandExecutionPool::Lane,
            vec![SidecarResource::AiLocalizationKnowledge]
        ))
    );
    assert_eq!(
        typed_command_binding(UpdateLocalizationReviewIssuesParams {
            request: UpdateReviewIssuesRequest {
                run_id: String::new(),
                issues: vec![],
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Mutation,
            HostCommandExecutionPool::Lane,
            vec![SidecarResource::AiLocalizationKnowledge]
        ))
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
    for relative_path in command_source_files() {
        let file = parse_source(&relative_path);
        for item in file.items {
            if let Item::Fn(function) = item
                && function.attrs.iter().any(|attribute| {
                    let attribute = path_name(attribute.path());
                    attribute == "tauri::command" || attribute == "host_command"
                })
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
    assert_eq!(resolver.await_count, 0);
    assert!(!resolver.calls.contains("block_on"));
    let mut wrapper_names = BTreeSet::new();
    for relative_path in command_source_files() {
        let file = parse_source(&relative_path);
        for item in file.items {
            if let Item::Fn(function) = item
                && function.attrs.iter().any(|attribute| {
                    let attribute = path_name(attribute.path());
                    attribute == "tauri::command" || attribute == "host_command"
                })
            {
                wrapper_names.insert(function.sig.ident.to_string());
            }
        }
    }
    // The resolver may only reference command modules through wire envelope
    // type paths (…Params); a call to a wrapper function would appear as a
    // crate::<domain|infrastructure|support> path that does not end in Params.
    for path in &resolver.paths {
        if path.starts_with("crate::domain")
            || path.starts_with("crate::infrastructure")
            || path.starts_with("crate::support")
        {
            assert!(
                path.ends_with("Params"),
                "sidecar resolver must only reference command params types, found {path}"
            );
        }
    }
    assert!(!wrapper_names.is_empty());
}

#[test]
fn typed_sidecar_arms_are_canonical_policy_free_pointers() {
    let source =
        fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("src/sidecar.rs")).unwrap();
    let arm_start = "crate::host_command_wire!(";
    let mut typed_arms = 0;
    let mut cursor = 0;
    while let Some(relative) = source[cursor..].find("resolve_typed::<") {
        let absolute = cursor + relative;
        let arm_index = source[..absolute]
            .rfind(arm_start)
            .expect("typed arm without wire name");
        let name_end = source[arm_index..]
            .find(')')
            .map(|index| index + arm_index)
            .expect("unterminated wire name");
        let name = &source[arm_index + arm_start.len()..name_end];
        let body = &source[name_end + source[name_end..].find("=>").expect("arm without body")..];
        let stripped: String = body
            .chars()
            .filter(|character| !character.is_whitespace())
            .collect();
        assert!(
            stripped.starts_with("=>{resolve_typed::<crate::")
                || stripped.starts_with("=>resolve_typed::<crate::"),
            "typed arm {name} must be exactly a resolve_typed type pointer"
        );
        assert!(
            stripped.contains(">(ctx,id,args)"),
            "typed arm {name} must call resolve_typed(ctx, id, args)"
        );
        typed_arms += 1;
        cursor = absolute + 1;
    }
    assert!(typed_arms > 0, "expected typed sidecar arms");
}

#[test]
fn sidecar_resolver_avoids_async_domain_wrappers_that_spawn_blocking() {
    let sidecar = parse_source("sidecar.rs");
    let resolver = function_structure(find_function(&sidecar, "resolve_command"));
    assert!(!resolver.calls.contains("block_on"));
    // The blocking domain calls live inside the typed bindings' execution
    // closures now; they must still be invoked directly (never wrapped in a
    // spawn_blocking/block_on helper) inside the launcher command module.
    let launcher = parse_source("domain/launcher/commands.rs");
    let launcher_structure = file_structure(&launcher);
    for expected in [
        "persist_launcher_library_remote_cover_blocking",
        "search_launcher_catalog_blocking",
        "load_launcher_remote_mod_detail_blocking",
        "load_launcher_update_changelog_blocking",
        "resolve_cached_launcher_image_blocking",
        "check_launcher_updates_blocking",
    ] {
        assert!(
            launcher_structure.calls.contains(expected),
            "launcher bindings should call {expected} directly"
        );
    }
}

#[test]
fn download_cancel_is_control() {
    assert_eq!(
        typed_command_binding(DownloadLauncherModParams {
            request: DownloadLauncherModRequest {
                download_id: None,
                mod_id: 0,
                file_id: None,
                version: None,
                title: None,
            },
        })
        .map(|(lane, _, resources)| (lane, resources)),
        Some((HostCommandLane::Network, vec![]))
    );
    assert_eq!(
        typed_command_binding(CancelLauncherDownloadParams {
            download_id: String::new(),
        })
        .map(|(lane, _, resources)| (lane, resources)),
        Some((HostCommandLane::Control, vec![]))
    );
}

#[test]
fn mutable_cache_commands_declare_resource_locks_at_binding_site() {
    assert_eq!(
        typed_command_binding(CheckLauncherUpdatesParams {
            request: CheckLauncherUpdatesRequest {
                mods_path: String::new(),
                force_refresh: None,
                session_id: None,
            },
        })
        .map(|(_, _, resources)| resources),
        Some(vec![])
    );
    assert_eq!(
        typed_command_binding(ResolveLauncherImageParams {
            request: ResolveLauncherImageRequest {
                url: String::new(),
                refresh: None,
                mod_key: None,
            },
        })
        .map(|(_, _, resources)| resources),
        Some(vec![])
    );
    assert_eq!(
        typed_command_binding(ClearLauncherImageCacheParams {}).map(|(_, _, resources)| resources),
        Some(vec![SidecarResource::LauncherImageCache])
    );
    assert_eq!(
        typed_command_binding(ClearFileCacheParams {})
            .map(|(lane, _, resources)| (lane, resources)),
        Some((
            HostCommandLane::Mutation,
            vec![SidecarResource::GameAssetCache]
        ))
    );
    assert_eq!(
        typed_command_binding(RecordLauncherImageFailureParams {
            request: RecordLauncherImageFailureRequest {
                mod_key: String::new(),
                error: String::new(),
            },
        })
        .map(|(_, _, resources)| resources),
        Some(vec![SidecarResource::LauncherImageCache])
    );
    assert_eq!(
        typed_command_binding(PersistLauncherLibraryRemoteCoverParams {
            request: PersistLauncherLibraryRemoteCoverRequest {
                label_key: String::new(),
                image_url: String::new(),
            },
        })
        .map(|(lane, _, resources)| (lane, resources)),
        Some((HostCommandLane::Network, vec![]))
    );
    assert_eq!(
        typed_command_binding(LoadAppUiStateParams {}).map(|(_, _, resources)| resources),
        Some(vec![SidecarResource::AppUiState])
    );
    assert_eq!(
        typed_command_binding(PatchAppUiStateParams {
            request: AppUiStatePatch::default(),
        })
        .map(|(_, _, resources)| resources),
        Some(vec![SidecarResource::AppUiState])
    );
}

#[test]
fn launcher_mod_config_commands_declare_lane_and_resource_locks_at_binding_site() {
    assert_eq!(
        typed_command_binding(LoadLauncherModConfigParams {
            request: LoadLauncherModConfigRequest {
                mod_path: String::new(),
                locale: None,
            },
        })
        .map(|(lane, _, resources)| (lane, resources)),
        Some((HostCommandLane::Io, vec![]))
    );
    assert_eq!(
        typed_command_binding(SaveLauncherModConfigParams {
            request: SaveLauncherModConfigRequest {
                mod_path: String::new(),
                locale: None,
                values: BTreeMap::new(),
            },
        })
        .map(|(lane, _, resources)| (lane, resources)),
        Some((
            HostCommandLane::Mutation,
            vec![SidecarResource::LauncherModConfig]
        ))
    );
}

#[test]
fn project_and_cp_maker_mutations_declare_resource_locks_at_binding_site() {
    fn minimal_map_document() -> MapDocument {
        MapDocument {
            name: String::new(),
            format: MapFormat::Tbin,
            source_path: String::new(),
            relative_path: String::new(),
            width: 1,
            height: 1,
            tile_width: 16,
            tile_height: 16,
            orientation: String::new(),
            render_order: String::new(),
            tmx_version: None,
            tiled_version: None,
            next_layer_id: None,
            next_object_id: None,
            infinite: false,
            properties: HashMap::new(),
            tilesets: vec![],
            layers: vec![],
            object_groups: vec![],
            layer_order: vec![],
            preserved_xml: vec![],
        }
    }
    assert_eq!(
        typed_command_binding(DeleteCpMakerDraftParams {
            draft_storage_key: String::new(),
        })
        .map(|(lane, _, resources)| (lane, resources)),
        Some((
            HostCommandLane::Mutation,
            vec![SidecarResource::CpMakerDrafts]
        ))
    );
    // Pure serialization of an in-memory document: no persistent state, so it
    // runs on the io lane without resource locks.
    assert_eq!(
        typed_command_binding(BuildCpMakerMapAssetParams {
            request: BuildCpMakerMapAssetRequest {
                relative_path: String::new(),
                map_document: minimal_map_document(),
            },
        })
        .map(|(lane, _, resources)| (lane, resources)),
        Some((HostCommandLane::Io, vec![]))
    );
    let save_mod_i18n_params = || SaveModI18nFilesParams {
        request: SaveModI18nFilesRequest {
            source_path: String::new(),
            i18n_files: vec![],
        },
    };
    assert_eq!(
        typed_command_binding(save_mod_i18n_params()).map(|(lane, _, _)| lane),
        Some(HostCommandLane::Mutation)
    );
    assert_eq!(
        typed_command_binding(save_mod_i18n_params()).map(|(_, _, resources)| resources),
        Some(vec![])
    );
    assert!(typed_command_has_dynamic_resources(save_mod_i18n_params()));
    let save_draft_params = || SaveCpMakerDraftParams {
        draft: CpMakerDraftRecord {
            draft_storage_key: String::new(),
            project_metadata: CpMakerMetadata {
                project_name: String::new(),
                project_description: String::new(),
                project_author: String::new(),
                project_version: String::new(),
                project_unique_id: String::new(),
                game_root_path: None,
                content_pack_for_unique_id: String::new(),
                content_pack_for_minimum_version: None,
                minimum_api_version: None,
                update_keys: vec![],
                dependencies: vec![],
            },
            config_schema_draft: json!({}),
            serialized_change_registry: json!({}),
            dynamic_tokens: vec![],
            custom_locations: vec![],
            alias_token_names: BTreeMap::new(),
            event_source_snapshots_by_target: BTreeMap::new(),
            i18n_files: vec![],
            project_assets: vec![],
            last_draft_saved_at: None,
            last_exported_at: None,
            last_export_path: None,
            last_export_fingerprint: None,
        },
    };
    assert_eq!(
        typed_command_binding(save_draft_params()).map(|(_, _, resources)| resources),
        Some(vec![SidecarResource::CpMakerDrafts])
    );
    assert_eq!(
        typed_command_binding(LoadCpMakerSessionParams {})
            .map(|(lane, _, resources)| (lane, resources)),
        Some((HostCommandLane::Io, vec![SidecarResource::CpMakerDrafts]))
    );
    assert_eq!(
        typed_command_binding(SaveCpMakerSessionParams {
            session: CpMakerSession::default(),
        })
        .map(|(lane, _, resources)| (lane, resources)),
        Some((
            HostCommandLane::Mutation,
            vec![SidecarResource::CpMakerDrafts]
        ))
    );
    assert_eq!(
        typed_command_binding(CopyCpMakerDraftParams {
            request: CopyCpMakerDraftRequest {
                source_draft_storage_key: String::new(),
            },
        })
        .map(|(_, _, resources)| resources),
        Some(vec![SidecarResource::CpMakerDrafts])
    );
    assert_eq!(
        typed_command_binding(ExportCpMakerPackParams {
            request: CpMakerExportRequest {
                draft_storage_key: String::new(),
                output_path: String::new(),
                manifest_json: String::new(),
                content_json: String::new(),
                virtual_assets: vec![],
                i18n_files: vec![],
            },
        })
        .map(|(_, _, resources)| resources),
        Some(vec![
            SidecarResource::ModProject,
            SidecarResource::CpMakerDrafts
        ])
    );
    assert_eq!(
        typed_command_binding(ImportCpMakerPackParams {
            mod_directory_path: String::new(),
        })
        .map(|(_, _, resources)| resources),
        Some(vec![SidecarResource::CpMakerDrafts])
    );
    let read_asset_params = || ReadCpMakerProjectAssetParams {
        request: ReadProjectAssetRequest {
            draft_storage_key: String::new(),
            relative_path: String::new(),
        },
    };
    assert_eq!(
        typed_command_binding(read_asset_params()).map(|(_, _, resources)| resources),
        Some(vec![SidecarResource::CpMakerDrafts])
    );
    assert_eq!(
        typed_command_binding(LoadCpMakerProjectMapAssetParams {
            request: ReadProjectAssetRequest {
                draft_storage_key: String::new(),
                relative_path: String::new(),
            },
        })
        .map(|(lane, _, resources)| (lane, resources)),
        Some((HostCommandLane::Io, vec![SidecarResource::CpMakerDrafts]))
    );
    let write_params = || WriteCpMakerProjectAssetParams {
        request: WriteProjectAssetRequest {
            draft_storage_key: String::new(),
            relative_path: String::new(),
            media_type: String::new(),
            bytes_base64: String::new(),
            source_type: ProjectAssetSource::Imported,
        },
    };
    let rename_params = || RenameCpMakerProjectAssetParams {
        request: RenameProjectAssetRequest {
            draft_storage_key: String::new(),
            relative_path: String::new(),
            new_relative_path: String::new(),
        },
    };
    let delete_params = || DeleteCpMakerProjectAssetParams {
        request: DeleteProjectAssetRequest {
            draft_storage_key: String::new(),
            relative_path: String::new(),
        },
    };
    assert_binding_is_mutation_with_resources(write_params(), vec![SidecarResource::CpMakerDrafts]);
    assert_binding_is_mutation_with_resources(
        rename_params(),
        vec![SidecarResource::CpMakerDrafts],
    );
    assert_binding_is_mutation_with_resources(
        delete_params(),
        vec![SidecarResource::CpMakerDrafts],
    );
    let export_map_png_params = || ExportMapPngParams {
        output_path: String::new(),
        png_base64: String::new(),
    };
    assert_eq!(
        typed_command_binding(export_map_png_params()).map(|(lane, _, _)| lane),
        Some(HostCommandLane::Mutation)
    );
    assert_eq!(
        typed_command_binding(export_map_png_params()).map(|(_, _, resources)| resources),
        Some(vec![SidecarResource::MapPngExport])
    );
    let export_file_params = || ExportFileParams {
        output_path: String::new(),
        content_base64: String::new(),
    };
    assert_eq!(
        typed_command_binding(export_file_params()).map(|(lane, _, _)| lane),
        Some(HostCommandLane::Mutation)
    );
    assert_eq!(
        typed_command_binding(export_file_params()).map(|(_, _, resources)| resources),
        Some(vec![SidecarResource::FileExport])
    );
}

#[test]
fn semantic_download_and_indexing_declare_exclusive_resources_at_binding_site() {
    assert_eq!(
        typed_command_binding(DownloadLocalizationSemanticModelParams {
            request: DownloadAiSemanticModelRequest {
                job_id: String::new(),
                model_id: String::new(),
            },
        })
        .map(|(lane, _, resources)| (lane, resources)),
        Some((
            HostCommandLane::Network,
            vec![SidecarResource::AiSemanticModel]
        ))
    );
    assert_binding_is_mutation_on_pool(
        RebuildLocalizationSemanticIndexParams {
            request: RebuildAiSemanticIndexRequest {
                job_id: String::new(),
                scope_ids: vec![],
                confirm_remote_upload: false,
            },
        },
        HostCommandExecutionPool::AiSemanticIndexing,
        vec![
            SidecarResource::AiSemanticModel,
            SidecarResource::AiSemanticIndex,
            SidecarResource::AiLocalizationKnowledge,
            SidecarResource::AiOfficialLocalizationIndex,
        ],
    );
    assert_binding_is_mutation_on_pool(
        SyncLocalizationSemanticIndexParams {
            request: RebuildAiSemanticIndexRequest {
                job_id: String::new(),
                scope_ids: vec![],
                confirm_remote_upload: false,
            },
        },
        HostCommandExecutionPool::AiSemanticIndexing,
        vec![
            SidecarResource::AiSemanticModel,
            SidecarResource::AiSemanticIndex,
            SidecarResource::AiLocalizationKnowledge,
            SidecarResource::AiOfficialLocalizationIndex,
        ],
    );
    assert_eq!(
        typed_command_binding(ProbeLocalizationSemanticSearchParams {
            request: ProbeAiSemanticSearchRequest {
                query: String::new(),
                source_locale: String::new(),
                target_locale: String::new(),
                limit: 0,
            },
        })
        .map(|(lane, pool, resources)| (lane, pool, resources)),
        Some((
            HostCommandLane::Network,
            HostCommandExecutionPool::AiSemanticSearch,
            vec![
                SidecarResource::AiSemanticSettings,
                SidecarResource::AiSemanticModel,
                SidecarResource::AiSemanticIndex,
                SidecarResource::AiOfficialLocalizationIndex,
                SidecarResource::AiLocalizationKnowledge,
            ]
        ))
    );
    assert_eq!(
        typed_command_binding(VerifyLocalizationSemanticModelParams {
            request: VerifyAiSemanticModelRequest {
                mode: AiSemanticSearchMode::Lexical,
                model_id: None,
                local_model_directory: None,
            },
        })
        .map(|(_, _, resources)| resources),
        Some(vec![
            SidecarResource::AiSemanticSettings,
            SidecarResource::AiSemanticModel,
        ])
    );
    assert_eq!(
        typed_command_binding(AcquireLocalizationSemanticRuntimeParams {
            lease_id: String::new(),
        })
        .map(|(_, pool, _)| pool),
        Some(HostCommandExecutionPool::AiSemanticSearch)
    );
    // Warmup commands must stay off the semantic status locks: they warm
    // internally synchronized caches and would otherwise stall the fast
    // status queries behind a multi-second local model load.
    assert_eq!(
        typed_command_binding(AcquireLocalizationSemanticRuntimeParams {
            lease_id: String::new(),
        })
        .map(|(_, _, resources)| resources),
        Some(vec![])
    );
    assert_eq!(
        typed_command_binding(PrewarmLocalizationCorpusParams {}).map(|(_, pool, _)| pool),
        Some(HostCommandExecutionPool::AiSemanticSearch)
    );
    assert_eq!(
        typed_command_binding(PrewarmLocalizationCorpusParams {})
            .map(|(_, _, resources)| resources),
        Some(vec![
            SidecarResource::AiLocalizationKnowledge,
            SidecarResource::AiOfficialLocalizationIndex,
        ])
    );
    assert_eq!(
        typed_command_binding(ReleaseLocalizationSemanticRuntimeParams {
            lease_id: String::new(),
        })
        .map(|(lane, _, _)| lane),
        Some(HostCommandLane::Io)
    );
    assert_eq!(
        typed_command_binding(UnloadLocalizationSemanticRuntimeParams {})
            .map(|(_, _, resources)| resources),
        Some(vec![
            SidecarResource::AiSemanticModel,
            SidecarResource::AiSemanticIndex,
        ])
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
        typed_resolved_dynamic_resources(SaveModI18nFilesParams {
            request: SaveModI18nFilesRequest {
                source_path: path.to_string_lossy().into_owned(),
                i18n_files: vec![],
            },
        })
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
    completed: Mutex<mpsc::SyncSender<HostCommandResponse>>,
}

impl HostCommandResponseWriter for TestResponseWriter {
    fn write_response(&self, response: &HostCommandResponse) -> Result<(), String> {
        self.completed
            .lock()
            .map_err(|_| "test response writer lock poisoned".to_string())?
            .try_send(response.clone())
            .map_err(|error| format!("test response send failed: {error}"))
    }
}

struct TestSchedulerHarness {
    scheduler: HostCommandScheduler,
    completed: mpsc::Receiver<HostCommandResponse>,
}

struct FailingResponseWriter;

impl HostCommandResponseWriter for FailingResponseWriter {
    fn write_response(&self, _response: &HostCommandResponse) -> Result<(), String> {
        Err("simulated writer failure".to_string())
    }
}

fn test_config(
    control_max_concurrency: usize,
    network_max_concurrency: usize,
    io_max_concurrency: usize,
    mutation_max_concurrency: usize,
    pool_queue_capacity: usize,
) -> HostCommandSchedulerConfig {
    HostCommandSchedulerConfig {
        control_max_concurrency,
        network_max_concurrency,
        io_max_concurrency,
        mutation_max_concurrency,
        launcher_image_cdn_max_concurrency: HostCommandSchedulerConfig::default()
            .launcher_image_cdn_max_concurrency,
        ai_max_concurrency: HostCommandSchedulerConfig::default().ai_max_concurrency,
        ai_queue_capacity: HostCommandSchedulerConfig::default().ai_queue_capacity,
        ai_official_indexing_queue_capacity: HostCommandSchedulerConfig::default()
            .ai_official_indexing_queue_capacity,
        pool_queue_capacity,
    }
}

impl TestSchedulerHarness {
    fn new(config: HostCommandSchedulerConfig) -> Self {
        let (completed_tx, completed_rx) = mpsc::sync_channel(128);
        let writer = Arc::new(TestResponseWriter {
            completed: Mutex::new(completed_tx),
        });
        let resources = Arc::new(HostCommandResourceLocks::new());
        let debug_logging_state = DebugLoggingState::new();
        debug_logging_state.set_enabled(true);
        let scheduler = HostCommandScheduler::new(writer, resources, config, debug_logging_state);
        Self {
            scheduler,
            completed: completed_rx,
        }
    }

    fn submit(&self, command: ResolvedHostCommand) {
        self.scheduler.submit(command);
    }

    fn recv(&self) -> HostCommandResponse {
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
            .render()
    }
}

/// Checks the job counters of a pool row.
///
/// Pool rows pad every counter so columns line up across pools, so the fields
/// are matched one at a time instead of as an adjacent `jobs=N ok=N` pair.
fn pool_counters_are(summary: &str, submitted: u64, succeeded: u64) -> bool {
    let jobs = format!("jobs={submitted}");
    let ok = format!("ok={succeeded}");
    summary.lines().any(|line| {
        let fields: Vec<&str> = line.split_whitespace().collect();
        fields.contains(&jobs.as_str()) && fields.contains(&ok.as_str())
    })
}

fn create_test_command(
    lane: HostCommandLane,
    name: &str,
    resources: &'static [SidecarResource],
    run: impl FnOnce() -> HostCommandResult + Send + 'static,
) -> ResolvedHostCommand {
    create_test_command_on_pool(HostCommandExecutionPool::Lane, lane, name, resources, run)
}

fn create_test_command_on_pool(
    execution_pool: HostCommandExecutionPool,
    lane: HostCommandLane,
    name: &str,
    resources: &'static [SidecarResource],
    run: impl FnOnce() -> HostCommandResult + Send + 'static,
) -> ResolvedHostCommand {
    ResolvedHostCommand {
        id: json!(name),
        name: name.to_string(),
        lane,
        execution_pool,
        resources: resources.to_vec(),
        resource_resolver: None,
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
        HostCommandLane::Network,
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
        HostCommandLane::Control,
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
            HostCommandLane::Network,
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
    let scheduler = TestSchedulerHarness::new(HostCommandSchedulerConfig {
        launcher_image_cdn_max_concurrency: 1,
        ..test_config(1, 1, 1, 1, 8)
    });
    let (network_started_tx, network_started_rx) = mpsc::channel();
    let (release_network_tx, release_network_rx) = mpsc::channel();
    scheduler.submit(create_test_command(
        HostCommandLane::Network,
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
        HostCommandLane::Network,
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
fn ai_pool_does_not_share_network_lane_workers() {
    let scheduler = TestSchedulerHarness::new(HostCommandSchedulerConfig {
        ai_max_concurrency: 1,
        ..test_config(1, 1, 1, 1, 8)
    });
    let (network_started_tx, network_started_rx) = mpsc::channel();
    let (release_network_tx, release_network_rx) = mpsc::channel();
    scheduler.submit(create_test_command(
        HostCommandLane::Network,
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

    let (ai_started_tx, ai_started_rx) = mpsc::channel();
    scheduler.submit(create_test_command_on_pool(
        HostCommandExecutionPool::Ai,
        HostCommandLane::Network,
        "ai",
        NO_RESOURCES,
        move || {
            ai_started_tx
                .send(())
                .expect("AI command should signal start");
            Ok(Value::Null)
        },
    ));
    ai_started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("AI command should start on its dedicated pool");
    let response = scheduler.recv();
    assert_eq!(response.id, json!("ai"));
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
        HostCommandLane::Network,
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
        HostCommandLane::Io,
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
        HostCommandLane::Network,
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
        HostCommandLane::Mutation,
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
        HostCommandLane::Network,
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
        HostCommandLane::Mutation,
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
        HostCommandLane::Network,
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
        HostCommandLane::Mutation,
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
        HostCommandLane::Network,
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
        HostCommandLane::Mutation,
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
        HostCommandLane::Network,
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
        HostCommandLane::Control,
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
        HostCommandSchedulerConfig::default().mutation_max_concurrency,
        8,
    ));
    let active = Arc::new(AtomicUsize::new(0));
    let max_active = Arc::new(AtomicUsize::new(0));
    let (first_entered_tx, first_entered_rx) = mpsc::channel();
    let (release_first_tx, release_first_rx) = mpsc::channel();
    let first_active = Arc::clone(&active);
    let first_max_active = Arc::clone(&max_active);
    scheduler.submit(create_test_command(
        HostCommandLane::Mutation,
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
        HostCommandLane::Mutation,
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
        HostCommandLane::Network,
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
        HostCommandLane::Network,
        "queued",
        NO_RESOURCES,
        || Ok(Value::Null),
    ));
    scheduler.submit(create_test_command(
        HostCommandLane::Network,
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
    assert!(summary.contains("hostRuntime.stats reason=test"));
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
    let scheduler = HostCommandScheduler::new(
        Arc::new(FailingResponseWriter),
        Arc::new(HostCommandResourceLocks::new()),
        test_config(1, 1, 1, 1, 8),
        debug_logging_state,
    );
    scheduler.submit(create_test_command(
        HostCommandLane::Io,
        "writer-fails",
        NO_RESOURCES,
        || Ok(Value::Null),
    ));

    let deadline = std::time::Instant::now() + Duration::from_secs(1);
    let summary = loop {
        let summary = scheduler
            .diagnostics_summary("test")
            .expect("debug-enabled scheduler should produce diagnostics")
            .render();
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
        HostCommandLane::Io,
        "panic",
        NO_RESOURCES,
        || {
            panic!("simulated sidecar panic");
        },
    ));
    scheduler.submit(create_test_command(
        HostCommandLane::Io,
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
    let scheduler = HostCommandScheduler::new(
        writer,
        Arc::new(HostCommandResourceLocks::new()),
        test_config(1, 1, 1, 1, 8),
        debug_logging_state.clone(),
    );
    scheduler.submit(create_test_command(
        HostCommandLane::Network,
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
        HostCommandLane::Network,
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
            .render();
        // The pool row pads its counters so columns line up across pools, so the
        // fields are checked individually rather than as one adjacent pair.
        if pool_counters_are(&summary, 1, 1) {
            break summary;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "debug-enabled command should keep jobs and ok counts aligned: {summary}"
        );
        std::thread::sleep(Duration::from_millis(10));
    };
    assert!(
        pool_counters_are(&summary, 1, 1),
        "debug-enabled command should keep jobs and ok counts aligned: {summary}"
    );
}
