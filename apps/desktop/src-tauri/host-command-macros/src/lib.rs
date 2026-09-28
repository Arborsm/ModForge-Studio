//! Procedural macro backing the typed host command bindings.
//!
//! See the [`host_command`] attribute macro for the full grammar, option
//! semantics and error-resilience contract. In short: the attribute replaces
//! the hand-written three-piece binding (wire envelope struct + `impl
//! HostCommand` + thin `#[tauri::command]` wrapper) with a single annotated
//! function whose signature is the wire contract and whose body is the domain
//! invocation.

use proc_macro::TokenStream;
use proc_macro2::{Span, TokenStream as TokenStream2};
use quote::{format_ident, quote};
use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::spanned::Spanned;
use syn::visit::Visit;
use syn::{FnArg, Ident, ItemFn, Pat, Token, Type, parse_macro_input};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Lane {
    Control,
    Network,
    Io,
    Mutation,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Pool {
    Lane,
    ImageCdn,
    Ai,
    OfficialIndexing,
    SemanticIndexing,
    SemanticSearch,
}

impl Default for Pool {
    fn default() -> Self {
        Self::Lane
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Wrap {
    Ok,
    Ai,
    Raw,
}

impl Default for Wrap {
    fn default() -> Self {
        Self::Ok
    }
}

#[derive(Default)]
struct Spec {
    lane: Option<Lane>,
    pool: Pool,
    resources: Option<Vec<Ident>>,
    wrap: Wrap,
    context: bool,
}

enum ResourceMode {
    None,
    Required,
    Optional,
}

/// Typed host command binding: generates the wire struct, `const NAME`,
/// `impl HostCommand` and the `#[tauri::command]` wrapper from one function.
/// Signature = wire contract (first param `app: AppHandle`); body = domain call.
///
/// ```ignore
/// #[host_command(<lane>[, option*])]
/// lane := control | network | io | mutation
/// option := pool(lane|image_cdn|ai|official_indexing|semantic_indexing|semantic_search)
///         | resources(Resource*) | wrap(ok|ai|raw) | context
/// ```
///
/// `resources` = static locks; `wrap` = ok (default) / ai (`ok_ai`) / raw;
/// `context` = `control_with_context` (control only). Body references to
/// `app`/`debug_logging_state` are injected from the dispatch context.
///
/// Contract details the caller must honor:
/// - the function name must be snake_case matching `[a-z][a-z0-9_]*` (the
///   generator derives `HOST_COMMANDS`, `generate_handler!` and sidecar arms
///   from this shape);
/// - `wrap(raw)` and `context` bodies must return `HostCommandResult`
///   (`Result<serde_json::Value, serde_json::Value>`), regardless of the
///   wrapper's declared signature — `wrap(ok)` bodies return `Result<T, E>`
///   and `wrap(ai)` bodies return `anyhow::Result<T>`;
/// - the function cannot be generic.
///
/// Invalid options fall back to defaults with spanned `compile_error!`s
/// (error-resilient expansion, rust-analyzer #15452).
#[proc_macro_attribute]
pub fn host_command(attr: TokenStream, item: TokenStream) -> TokenStream {
    let attr = TokenStream2::from(attr);
    let item = parse_macro_input!(item as ItemFn);

    match expand(attr, item) {
        Ok(tokens) => tokens.into(),
        Err(error) => error.to_compile_error().into(),
    }
}

fn expand(attr: TokenStream2, item: ItemFn) -> syn::Result<TokenStream2> {
    let ParsedSpec { spec, mut errors } = parse_spec(attr);
    let lane = spec.lane.unwrap_or_else(|| {
        errors.push(syn::Error::new(
            item.sig.ident.span(),
            "missing lane keyword; expected control | network | io | mutation",
        ));
        Lane::Io
    });

    let name = item.sig.ident.clone();
    let name_str = name.to_string();
    if !is_valid_wire_name(&name_str) {
        errors.push(syn::Error::new(
            name.span(),
            "host command names must be snake_case ([a-z][a-z0-9_]*): the generator derives HOST_COMMANDS, generate_handler! and the sidecar routing table from this shape, so any other name is silently unreachable",
        ));
    }
    if spec.context {
        if spec.wrap != Wrap::Ok {
            errors.push(syn::Error::new(
                name.span(),
                "`context` cannot be combined with `wrap`: context bodies must return HostCommandResult directly",
            ));
        }
        if spec.pool != Pool::Lane {
            errors.push(syn::Error::new(
                name.span(),
                "`context` cannot be combined with `pool`: control_with_context runs on the control lane",
            ));
        }
    }

    let vis = item.vis.clone();
    let sig = item.sig.clone();
    let block = item.block.clone();

    if sig.generics.lt_token.is_some()
        || !sig.generics.params.is_empty()
        || sig.generics.where_clause.is_some()
    {
        errors.push(syn::Error::new(
            sig.generics.span(),
            "host_command functions cannot be generic: the generated wire envelope struct and HostCommand impl cannot carry generic parameters",
        ));
    }

    let mut inputs = sig.inputs.iter();
    let app_arg = inputs.next().ok_or_else(|| {
        syn::Error::new(
            sig.span(),
            "expected `app: AppHandle` as the first parameter",
        )
    })?;
    let (app_ident, app_ty) = fn_arg_ident_type(app_arg)?;
    if app_ident != "app" {
        errors.push(syn::Error::new(
            app_ident.span(),
            "the first parameter must be named `app`; the generated wrapper calls `execute(app, ...)`",
        ));
    }
    if !is_app_handle_type(&app_ty) {
        errors.push(syn::Error::new(
            app_ty.span(),
            "the first parameter must be typed `AppHandle`",
        ));
    }

    let payload: Vec<(Ident, Type)> = inputs
        .map(|arg| {
            let (ident, ty) = fn_arg_ident_type(arg)?;
            Ok((ident, ty))
        })
        .collect::<syn::Result<_>>()?;

    let params_type = format_ident!("{}Params", to_pascal_case(&name_str));

    let mut scan = UsageScan {
        app_name: app_ident.to_string(),
        uses_app: false,
        uses_debug: false,
    };
    scan.visit_block(&block);

    let struct_def = generate_struct(&params_type, &payload);
    let impl_block = generate_impl(
        &params_type,
        &name_str,
        lane,
        &spec,
        &payload,
        &block,
        &app_ident,
        &scan,
        &mut errors,
    );

    let wrapper_fields = if payload.is_empty() {
        quote! { {} }
    } else {
        let idents = payload.iter().map(|(id, _)| id);
        quote! { { #(#idents),* } }
    };

    let wrapper = quote! {
        #[tauri::command]
        #vis #sig {
            crate::host_runtime::execute(app, #params_type #wrapper_fields).await
        }
    };

    // Error-resilient expansion (rust-analyzer #15452 guidance): attribute
    // errors never abort the expansion; the struct/impl/wrapper are always
    // generated (with defaults for the invalid slots) and the diagnostics are
    // appended as spanned compile_error! invocations.
    let diagnostics = errors.iter().map(|error| error.to_compile_error());
    Ok(quote! {
        #struct_def
        #impl_block
        #wrapper
        #(#diagnostics)*
    })
}

/// Attribute options plus any diagnostics recovered during parsing. When an
/// option is invalid, parsing continues with that slot's default and the
/// spanned error is collected, so the expansion stays structurally intact.
struct ParsedSpec {
    spec: Spec,
    errors: Vec<syn::Error>,
}

fn parse_spec(attr: TokenStream2) -> ParsedSpec {
    let mut spec = Spec::default();
    let mut errors = Vec::new();
    let metas = match Punctuated::<syn::Meta, Token![,]>::parse_terminated.parse2(attr) {
        Ok(metas) => metas,
        Err(error) => {
            return ParsedSpec {
                spec,
                errors: vec![error],
            };
        }
    };

    let mut pool_seen = false;
    let mut wrap_seen = false;
    let mut resources_seen = false;
    for meta in metas {
        match meta {
            syn::Meta::Path(path) => {
                if let Some(lane) = parse_lane(&path) {
                    if spec.lane.is_some() {
                        errors.push(err_at(&path, "duplicate lane keyword"));
                    } else {
                        spec.lane = Some(lane);
                    }
                } else if path.is_ident("context") {
                    spec.context = true;
                } else {
                    let found = path
                        .segments
                        .last()
                        .map(|segment| segment.ident.to_string())
                        .unwrap_or_default();
                    errors.push(err_at(
                        &path,
                        &format!(
                            "expected a lane keyword (control | network | io | mutation) or `context`, found `{found}`"
                        ),
                    ));
                }
            }
            syn::Meta::List(list) => {
                if list.path.is_ident("resources") {
                    if resources_seen {
                        errors.push(err_at(&list, "duplicate resources option"));
                        continue;
                    }
                    resources_seen = true;
                    match Punctuated::<Ident, Token![,]>::parse_terminated.parse2(list.tokens) {
                        Ok(idents) => spec.resources = Some(idents.into_iter().collect()),
                        Err(error) => errors.push(error),
                    }
                } else if list.path.is_ident("pool") {
                    if pool_seen {
                        errors.push(err_at(&list, "duplicate pool option"));
                        continue;
                    }
                    pool_seen = true;
                    match list.parse_args::<Ident>() {
                        Ok(ident) => match parse_pool(&ident) {
                            Ok(pool) => spec.pool = pool,
                            Err(error) => errors.push(error),
                        },
                        Err(error) => errors.push(error),
                    }
                } else if list.path.is_ident("wrap") {
                    if wrap_seen {
                        errors.push(err_at(&list, "duplicate wrap option"));
                        continue;
                    }
                    wrap_seen = true;
                    match list.parse_args::<Ident>() {
                        Ok(ident) => match parse_wrap(&ident) {
                            Ok(wrap) => spec.wrap = wrap,
                            Err(error) => errors.push(error),
                        },
                        Err(error) => errors.push(error),
                    }
                } else {
                    errors.push(err_at(
                        &list,
                        "unknown option; expected resources/pool/wrap",
                    ));
                }
            }
            syn::Meta::NameValue(nv) => {
                errors.push(err_at(
                    &nv,
                    "unexpected `name = value` form; use `name(value)`",
                ));
            }
        }
    }

    ParsedSpec { spec, errors }
}

fn parse_lane(path: &syn::Path) -> Option<Lane> {
    let ident = path.get_ident()?;
    match ident.to_string().as_str() {
        "control" => Some(Lane::Control),
        "network" => Some(Lane::Network),
        "io" => Some(Lane::Io),
        "mutation" => Some(Lane::Mutation),
        _ => None,
    }
}

fn parse_pool(ident: &Ident) -> syn::Result<Pool> {
    Ok(match ident.to_string().as_str() {
        "lane" => Pool::Lane,
        "image_cdn" => Pool::ImageCdn,
        "ai" => Pool::Ai,
        "official_indexing" => Pool::OfficialIndexing,
        "semantic_indexing" => Pool::SemanticIndexing,
        "semantic_search" => Pool::SemanticSearch,
        _ => {
            return Err(syn::Error::new(
                ident.span(),
                format!(
                    "unknown pool `{ident}`; expected one of: lane, image_cdn, ai, official_indexing, semantic_indexing, semantic_search"
                ),
            ));
        }
    })
}

fn parse_wrap(ident: &Ident) -> syn::Result<Wrap> {
    Ok(match ident.to_string().as_str() {
        "ok" => Wrap::Ok,
        "ai" => Wrap::Ai,
        "raw" => Wrap::Raw,
        _ => {
            return Err(syn::Error::new(
                ident.span(),
                format!("unknown wrap `{ident}`; expected ok | ai | raw"),
            ));
        }
    })
}

fn generate_struct(params_type: &Ident, payload: &[(Ident, Type)]) -> TokenStream2 {
    if payload.is_empty() {
        quote! {
            #[derive(Debug, ::serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            pub struct #params_type {}
        }
    } else {
        let fields = payload.iter().map(|(id, ty)| {
            if is_option(ty) {
                quote! { #[serde(default)] pub #id: #ty }
            } else {
                quote! { pub #id: #ty }
            }
        });
        quote! {
            #[derive(Debug, ::serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            pub struct #params_type {
                #(#fields),*
            }
        }
    }
}

fn generate_impl(
    params_type: &Ident,
    name_str: &str,
    lane: Lane,
    spec: &Spec,
    payload: &[(Ident, Type)],
    block: &syn::Block,
    app_ident: &Ident,
    scan: &UsageScan,
    errors: &mut Vec<syn::Error>,
) -> TokenStream2 {
    let mut bindings = TokenStream2::new();
    if !payload.is_empty() {
        let idents = payload.iter().map(|(id, _)| id);
        bindings.extend(quote! { let #params_type { #(#idents),* } = params; });
    }
    if scan.uses_app {
        bindings.extend(quote! { let #app_ident = ctx.app.clone(); });
    }
    if scan.uses_debug {
        bindings.extend(quote! { let debug_logging_state = ctx.debug_logging_state.clone(); });
    }

    let ctx_ident = if scan.uses_app || scan.uses_debug {
        format_ident!("ctx")
    } else {
        format_ident!("_ctx")
    };
    let params_ident = if payload.is_empty() {
        format_ident!("_params")
    } else {
        format_ident!("params")
    };

    let (method, resources) = match builder_for(lane, spec) {
        Ok(pair) => pair,
        Err(error) => {
            // Keep the expansion structurally valid for rust-analyzer: fall
            // back to the plain lane builder (context closures keep their
            // control_with_context shape) while the diagnostic is reported.
            errors.push(error);
            if spec.context {
                (ident("control_with_context"), None)
            } else {
                (ident(lane_plain_builder(lane)), None)
            }
        }
    };

    let run = if spec.context {
        quote! { move |command_context| #block }
    } else {
        match spec.wrap {
            Wrap::Ok => quote! { move || crate::host_runtime::ok(#block) },
            Wrap::Ai => quote! { move || crate::domain::ai::ok_ai(#block) },
            Wrap::Raw => quote! { move || #block },
        }
    };

    let call = match resources {
        Some(res) => quote! { Self::#method(id, #res, #run) },
        None => quote! { Self::#method(id, #run) },
    };

    quote! {
        impl crate::host_runtime::HostCommand for #params_type {
            const NAME: &'static str = #name_str;

            fn resolve(
                #ctx_ident: &crate::host_runtime::DispatchContext,
                id: ::serde_json::Value,
                #params_ident: Self,
            ) -> crate::host_runtime::ResolvedCommandOrResponse {
                #bindings
                #call
            }
        }
    }
}

/// The plain (no pool, no resources) builder name for a lane, used as the
/// error-recovery fallback so invalid lane/pool combos still expand.
fn lane_plain_builder(lane: Lane) -> &'static str {
    match lane {
        Lane::Control => "control",
        Lane::Network => "network",
        Lane::Io => "io",
        Lane::Mutation => "mutation",
    }
}

fn builder_for(lane: Lane, spec: &Spec) -> syn::Result<(Ident, Option<TokenStream2>)> {
    if spec.context {
        if lane != Lane::Control {
            return Err(syn::Error::new(
                Span::call_site(),
                "`context` is only valid on the control lane",
            ));
        }
        if spec.resources.is_some() {
            return Err(syn::Error::new(
                Span::call_site(),
                "`context` cannot be combined with `resources`",
            ));
        }
        return Ok((ident("control_with_context"), None));
    }

    let resource_arg = spec.resources.as_ref().map(|list| {
        let variants = list
            .iter()
            .map(|r| quote! { crate::host_runtime::HostCommandResource::#r });
        quote! { &[#(#variants),*] }
    });

    let (base, mode) = match (lane, spec.pool) {
        (Lane::Control, Pool::Lane) => ("control", ResourceMode::Optional),
        (Lane::Io, Pool::Lane) => ("io", ResourceMode::Optional),
        (Lane::Network, Pool::Lane) => ("network", ResourceMode::Optional),
        (Lane::Mutation, Pool::Lane) => {
            if spec.resources.is_none() {
                return Err(syn::Error::new(
                    Span::call_site(),
                    "mutation commands must declare resources(...): persistent or destructive writes must be serialized per resource",
                ));
            }
            ("mutation", ResourceMode::Optional)
        }
        (Lane::Io, Pool::SemanticSearch) => ("io_on_semantic_search_pool", ResourceMode::Required),
        (Lane::Network, Pool::SemanticSearch) => {
            ("network_on_semantic_search_pool", ResourceMode::Required)
        }
        (Lane::Mutation, Pool::SemanticIndexing) => {
            ("mutation_on_semantic_indexing_pool", ResourceMode::Required)
        }
        (Lane::Mutation, Pool::OfficialIndexing) => {
            ("mutation_on_official_indexing_pool", ResourceMode::Required)
        }
        (Lane::Network, Pool::ImageCdn) => ("network_on_image_cdn_pool", ResourceMode::None),
        (Lane::Network, Pool::Ai) => ("ai_network", ResourceMode::None),
        _ => {
            return Err(syn::Error::new(
                Span::call_site(),
                format!(
                    "lane/pool combination is not allowed (lane: {lane:?}, pool: {:?}); valid combinations: control[lane], io[lane, semantic_search], network[lane, semantic_search, image_cdn, ai], mutation[lane, semantic_indexing, official_indexing]",
                    spec.pool
                ),
            ));
        }
    };

    let (method, res) = match mode {
        ResourceMode::None => (ident(base), None),
        ResourceMode::Required => (
            ident(base),
            Some(resource_arg.unwrap_or_else(|| quote! { &[] })),
        ),
        ResourceMode::Optional => match resource_arg {
            Some(ra) => (ident(&format!("{base}_with_resources")), Some(ra)),
            None => (ident(base), None),
        },
    };

    Ok((method, res))
}

fn ident(name: &str) -> Ident {
    Ident::new(name, Span::call_site())
}

/// `[a-z][a-z0-9_]*` — the exact shape the generator's scan patterns accept.
fn is_valid_wire_name(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

fn is_app_handle_type(ty: &Type) -> bool {
    match ty {
        Type::Path(type_path) => type_path
            .path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == "AppHandle"),
        _ => false,
    }
}

fn fn_arg_ident_type(arg: &FnArg) -> syn::Result<(Ident, Type)> {
    match arg {
        FnArg::Typed(pat_type) => {
            let ident = match &*pat_type.pat {
                Pat::Ident(pat_ident) => pat_ident.ident.clone(),
                other => {
                    return Err(syn::Error::new(
                        other.span(),
                        "expected a simple identifier parameter",
                    ));
                }
            };
            Ok((ident, (*pat_type.ty).clone()))
        }
        FnArg::Receiver(_) => Err(syn::Error::new(
            arg.span(),
            "`self` receiver is not allowed",
        )),
    }
}

fn is_option(ty: &Type) -> bool {
    match ty {
        Type::Path(type_path) => type_path
            .path
            .segments
            .last()
            .is_some_and(|segment| segment.ident == "Option"),
        _ => false,
    }
}

fn to_pascal_case(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut capitalize = true;
    for ch in value.chars() {
        if ch == '_' {
            capitalize = true;
        } else if capitalize {
            out.extend(ch.to_uppercase());
            capitalize = false;
        } else {
            out.push(ch);
        }
    }
    out
}

fn err_at<T: Spanned>(spanned: &T, message: &str) -> syn::Error {
    syn::Error::new(spanned.span(), message)
}

struct UsageScan {
    app_name: String,
    uses_app: bool,
    uses_debug: bool,
}

impl<'ast> Visit<'ast> for UsageScan {
    fn visit_expr_path(&mut self, node: &'ast syn::ExprPath) {
        if node.qself.is_none() && node.path.segments.len() == 1 {
            let segment = &node.path.segments[0];
            if segment.arguments.is_empty() {
                let name = segment.ident.to_string();
                if name == self.app_name {
                    self.uses_app = true;
                } else if name == "debug_logging_state" {
                    self.uses_debug = true;
                }
            }
        }
        syn::visit::visit_expr_path(self, node);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn expand_str(attr: &str, item: &str) -> String {
        let attr = syn::parse_str(attr).expect("attr parses");
        let item = syn::parse_str(item).expect("item parses");
        expand(attr, item).expect("expand succeeds").to_string()
    }

    /// TokenStream rendering inserts whitespace; compare ignoring it.
    fn contains_normalized(haystack: &str, needle: &str) -> bool {
        let normalize = |s: &str| s.chars().filter(|c| !c.is_whitespace()).collect::<String>();
        normalize(haystack).contains(&normalize(needle))
    }

    #[test]
    fn pascal_case_conversion() {
        // Shared vectors with the generator's toPascalCase test; both sides
        // must stay identical or the sidecar params type stops resolving.
        let vectors = [
            ("scan_default_save_slots", "ScanDefaultSaveSlots"),
            ("load_xact_audio_data_url", "LoadXactAudioDataUrl"),
            ("path", "Path"),
            ("load_2fa_codes", "Load2faCodes"),
            ("a__b", "AB"),
            ("x_act", "XAct"),
        ];
        for (input, expected) in vectors {
            assert_eq!(to_pascal_case(input), expected, "input: {input}");
        }
    }

    #[test]
    fn plain_io_command_expands_struct_and_impl() {
        let out = expand_str(
            "io",
            "pub async fn scan_default_save_slots(app: AppHandle) -> Result<(), String> { \
             domain::saves::scan_default_save_slots() }",
        );
        assert!(
            contains_normalized(&out, "pub struct ScanDefaultSaveSlotsParams {}"),
            "{out}"
        );
        assert!(
            contains_normalized(
                &out,
                "const NAME: &'static str = \"scan_default_save_slots\""
            ),
            "{out}"
        );
        assert!(
            contains_normalized(&out, "Self::io(id, move || crate::host_runtime::ok("),
            "{out}"
        );
        assert!(
            contains_normalized(
                &out,
                "crate::host_runtime::execute(app, ScanDefaultSaveSlotsParams {}).await"
            ),
            "{out}"
        );
    }

    #[test]
    fn option_field_gets_serde_default() {
        let out = expand_str(
            "io",
            "pub async fn load_ai_settings(app: AppHandle, profile_id: Option<String>) -> Result<(), String> { \
             domain::ai::load(profile_id) }",
        );
        assert!(
            contains_normalized(&out, "#[serde(default)] pub profile_id: Option<String>"),
            "{out}"
        );
    }

    #[test]
    fn body_referencing_app_injects_ctx_binding() {
        let out = expand_str(
            "control",
            "pub async fn open_launcher_path(app: AppHandle) -> Result<(), String> { \
             domain::launcher::open(&app) }",
        );
        assert!(
            contains_normalized(&out, "let app = ctx.app.clone();"),
            "{out}"
        );
        assert!(
            contains_normalized(
                &out,
                "fn resolve(ctx: &crate::host_runtime::DispatchContext"
            ),
            "{out}"
        );
    }

    #[test]
    fn resources_select_with_resources_builder() {
        let out = expand_str(
            "mutation, resources(LauncherSettings)",
            "pub async fn save_launcher_settings(app: AppHandle) -> Result<(), String> { \
             domain::launcher::save() }",
        );
        assert!(
            contains_normalized(
                &out,
                "Self::mutation_with_resources(id, &[crate::host_runtime::HostCommandResource::LauncherSettings]"
            ),
            "{out}"
        );
    }

    #[test]
    fn ai_pool_selects_ai_network_builder() {
        let out = expand_str(
            "network, pool(ai)",
            "pub async fn translate_ai_batch(app: AppHandle) -> Result<(), String> { \
             domain::ai::translate() }",
        );
        assert!(
            contains_normalized(
                &out,
                "Self::ai_network(id, move || crate::host_runtime::ok("
            ),
            "{out}"
        );
    }

    #[test]
    fn ai_wrap_uses_ok_ai() {
        let out = expand_str(
            "network, wrap(ai)",
            "pub async fn list_ai_models(app: AppHandle) -> Result<(), String> { \
             domain::ai::list() }",
        );
        assert!(
            contains_normalized(&out, "move || crate::domain::ai::ok_ai("),
            "{out}"
        );
    }

    #[test]
    fn context_uses_control_with_context() {
        let out = expand_str(
            "control, context",
            "pub async fn print_host_runtime_diagnostics(app: AppHandle) -> Result<(), String> { \
             command_context.print_diagnostics_summary(\"manual\") }",
        );
        assert!(
            contains_normalized(
                &out,
                "Self::control_with_context(id, move |command_context|"
            ),
            "{out}"
        );
    }

    #[test]
    fn missing_lane_is_recovered_with_diagnostic_in_expansion() {
        let attr = syn::parse_str::<TokenStream2>("").unwrap();
        let item = syn::parse_str::<ItemFn>(
            "pub async fn foo(app: AppHandle) -> Result<(), String> { bar() }",
        )
        .unwrap();
        let out = expand(attr, item)
            .expect("expansion survives a missing lane")
            .to_string();
        assert!(
            contains_normalized(&out, "pub struct FooParams {}"),
            "{out}"
        );
        assert!(
            contains_normalized(&out, "impl crate::host_runtime::HostCommand for FooParams"),
            "{out}"
        );
        assert!(out.contains("missing lane keyword"), "{out}");
    }

    #[test]
    fn unknown_pool_error_lists_valid_pools() {
        let attr = syn::parse_str::<TokenStream2>("network, pool(aii)").unwrap();
        let item = syn::parse_str::<ItemFn>(
            "pub async fn foo(app: AppHandle) -> Result<(), String> { bar() }",
        )
        .unwrap();
        let out = expand(attr, item)
            .expect("expansion survives an unknown pool")
            .to_string();
        assert!(
            out.contains(
                "expected one of: lane, image_cdn, ai, official_indexing, semantic_indexing, semantic_search"
            ),
            "{out}"
        );
        assert!(out.contains("`aii`"), "{out}");
        // Recovery keeps the expansion structurally valid (plain network builder).
        assert!(
            contains_normalized(&out, "Self::network(id, move || crate::host_runtime::ok("),
            "{out}"
        );
    }

    #[test]
    fn invalid_lane_pool_combo_lists_valid_combinations() {
        let attr = syn::parse_str::<TokenStream2>("io, pool(image_cdn)").unwrap();
        let item = syn::parse_str::<ItemFn>(
            "pub async fn foo(app: AppHandle) -> Result<(), String> { bar() }",
        )
        .unwrap();
        let out = expand(attr, item)
            .expect("expansion survives an invalid lane/pool combo")
            .to_string();
        assert!(out.contains("valid combinations"), "{out}");
        assert!(out.contains("io[lane, semantic_search]"), "{out}");
        // Recovery falls back to the plain io builder.
        assert!(
            contains_normalized(&out, "Self::io(id, move || crate::host_runtime::ok("),
            "{out}"
        );
    }

    #[test]
    fn unknown_wrap_error_lists_valid_wraps() {
        let attr = syn::parse_str::<TokenStream2>("io, wrap(done)").unwrap();
        let item = syn::parse_str::<ItemFn>(
            "pub async fn foo(app: AppHandle) -> Result<(), String> { bar() }",
        )
        .unwrap();
        let out = expand(attr, item)
            .expect("expansion survives an unknown wrap")
            .to_string();
        assert!(
            out.contains("unknown wrap `done`; expected ok | ai | raw"),
            "{out}"
        );
    }

    #[test]
    fn non_snake_case_name_reports_an_error_but_still_expands() {
        let attr = syn::parse_str::<TokenStream2>("io").unwrap();
        let item = syn::parse_str::<ItemFn>(
            "pub async fn LoadAI(app: AppHandle) -> Result<(), String> { bar() }",
        )
        .unwrap();
        let out = expand(attr, item)
            .expect("expansion survives a non-snake_case name")
            .to_string();
        assert!(out.contains("must be snake_case"), "{out}");
        assert!(
            contains_normalized(&out, "pub struct LoadAIParams"),
            "{out}"
        );
    }

    #[test]
    fn first_parameter_must_be_named_app_with_app_handle_type() {
        let attr = syn::parse_str::<TokenStream2>("io").unwrap();
        let renamed = syn::parse_str::<ItemFn>(
            "pub async fn foo(handle: AppHandle) -> Result<(), String> { bar() }",
        )
        .unwrap();
        let out = expand(attr.clone(), renamed)
            .expect("expansion survives a renamed first parameter")
            .to_string();
        assert!(out.contains("must be named `app`"), "{out}");

        let mistyped = syn::parse_str::<ItemFn>(
            "pub async fn foo(app: String) -> Result<(), String> { bar() }",
        )
        .unwrap();
        let out = expand(attr, mistyped)
            .expect("expansion survives a mistyped first parameter")
            .to_string();
        assert!(out.contains("must be typed `AppHandle`"), "{out}");
    }

    #[test]
    fn generic_functions_are_rejected() {
        let attr = syn::parse_str::<TokenStream2>("io").unwrap();
        let item = syn::parse_str::<ItemFn>(
            "pub async fn foo<T>(app: AppHandle, value: T) -> Result<(), String> { bar() }",
        )
        .unwrap();
        let out = expand(attr, item)
            .expect("expansion survives a generic function")
            .to_string();
        assert!(out.contains("cannot be generic"), "{out}");
    }

    #[test]
    fn context_conflicts_with_wrap_and_pool() {
        let wrap_attr = syn::parse_str::<TokenStream2>("control, context, wrap(ai)").unwrap();
        let item = syn::parse_str::<ItemFn>(
            "pub async fn foo(app: AppHandle) -> Result<(), String> { bar() }",
        )
        .unwrap();
        let out = expand(wrap_attr, item.clone())
            .expect("expansion survives context + wrap")
            .to_string();
        assert!(
            out.contains("`context` cannot be combined with `wrap`"),
            "{out}"
        );

        let pool_attr = syn::parse_str::<TokenStream2>("control, context, pool(ai)").unwrap();
        let out = expand(pool_attr, item)
            .expect("expansion survives context + pool")
            .to_string();
        assert!(
            out.contains("`context` cannot be combined with `pool`"),
            "{out}"
        );
    }

    #[test]
    fn duplicate_options_are_reported() {
        let pool_attr = syn::parse_str::<TokenStream2>("network, pool(ai), pool(ai)").unwrap();
        let item = syn::parse_str::<ItemFn>(
            "pub async fn foo(app: AppHandle) -> Result<(), String> { bar() }",
        )
        .unwrap();
        let out = expand(pool_attr, item.clone())
            .expect("expansion survives a duplicate pool")
            .to_string();
        assert!(out.contains("duplicate pool option"), "{out}");

        let wrap_attr = syn::parse_str::<TokenStream2>("io, wrap(ai), wrap(ok)").unwrap();
        let out = expand(wrap_attr, item.clone())
            .expect("expansion survives a duplicate wrap")
            .to_string();
        assert!(out.contains("duplicate wrap option"), "{out}");

        let resources_attr = syn::parse_str::<TokenStream2>(
            "mutation, resources(AiSettings), resources(AiSettings)",
        )
        .unwrap();
        let out = expand(resources_attr, item)
            .expect("expansion survives duplicate resources")
            .to_string();
        assert!(out.contains("duplicate resources option"), "{out}");
    }

    #[test]
    fn mutation_without_resources_is_rejected() {
        let attr = syn::parse_str::<TokenStream2>("mutation").unwrap();
        let item = syn::parse_str::<ItemFn>(
            "pub async fn foo(app: AppHandle) -> Result<(), String> { bar() }",
        )
        .unwrap();
        let out = expand(attr, item)
            .expect("expansion survives a lockless mutation")
            .to_string();
        assert!(
            out.contains("mutation commands must declare resources(...)"),
            "{out}"
        );
        // Recovery keeps the expansion structurally valid (plain mutation builder).
        assert!(
            contains_normalized(&out, "Self::mutation(id, move || crate::host_runtime::ok("),
            "{out}"
        );
    }
}
