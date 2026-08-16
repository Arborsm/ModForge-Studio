# Typed Host Command Binding (Tauri Native Form)

Status: adopted, complete (all 172 commands typed; binding generation via the
`#[host_command]` proc-macro, with `save_mod_i18n_files` hand-written as the
resource-resolver exception). This document records the final architecture.

## Problem recap

172 `#[tauri::command]` wrappers funnel through the shared host runtime so
Tauri and the Electron sidecar share one binding. The hand-written typed form
solved the single-source-of-truth problem but left three pieces of ceremony
per command: a wire envelope struct, an `impl HostCommand` block (`const
NAME` + `resolve`), and a thin wrapper. For a no-arg command that was ~10
lines of pure boilerplate around one domain call. The `#[host_command]`
attribute macro absorbs all of it: the annotated function's signature is the
single source for the wire contract, and the body is the domain invocation.

## Target shape

Per command, one attributed function, living in a `commands.rs` next to the
domain logic it invokes (e.g. `infrastructure/game_formats/xact/commands.rs`):

```rust
use host_command_macros::host_command;

#[host_command(io)]
pub async fn load_xact_audio_data_url(
    app: AppHandle,
    root_path: String,
    cue: String,
) -> Result<String, String> {
    crate::infrastructure::game_formats::xact::load_xact_audio_data_url(&root_path, &cue)
}
```

The macro expands this into exactly what the hand-written form declared:

- `pub struct LoadXactAudioDataUrlParams { pub root_path: String, pub cue: String }`
  with `#[derive(Debug, ::serde::Deserialize)]` +
  `#[serde(rename_all = "camelCase")]`; `Option` fields automatically carry
  `#[serde(default)]` (mirrors `optional_arg` semantics for missing/null).
- `impl HostCommand` with `const NAME = "load_xact_audio_data_url"` and a
  `resolve` that destructures `params` into the payload argument names and
  calls the selected lane/pool/resource builder with
  `crate::host_runtime::ok({ <body> })`.
- the `#[tauri::command]` wrapper:
  `crate::host_runtime::execute(app, LoadXactAudioDataUrlParams { root_path, cue }).await`.

The sidecar arm remains a policy-free, generator-verified type pointer:

```rust
crate::host_command_wire!(load_xact_audio_data_url) => resolve_typed::<
    crate::infrastructure::game_formats::xact::commands::LoadXactAudioDataUrlParams,
>(ctx, id, args),
```

## Attribute grammar

```
#[host_command(<lane>[, <option>*])]
lane    := control | network | io | mutation
option  := pool(<pool>) | resources(<Resource>*) | wrap(ok|ai|raw) | context
pool    := lane | image_cdn | ai | official_indexing | semantic_indexing | semantic_search
```

| Attribute                           | Builder                                  | Meaning                                                                          |
| ----------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `io` / `network` / `control`        | `Self::io/network/control`               | lane, no resource locks                                                          |
| `mutation, resources(R…)`           | `Self::mutation_with_resources`          | mutation lane; `resources(...)` is required — lockless mutation is a macro error |
| `+ resources(R…)`                   | `Self::<lane>_with_resources(id, &[R…])` | static resource locks                                                            |
| `io, pool(semantic_search)`         | `io_on_semantic_search_pool`             | dedicated pool                                                                   |
| `network, pool(semantic_search)`    | `network_on_semantic_search_pool`        | dedicated pool                                                                   |
| `mutation, pool(semantic_indexing)` | `mutation_on_semantic_indexing_pool`     | dedicated pool                                                                   |
| `mutation, pool(official_indexing)` | `mutation_on_official_indexing_pool`     | dedicated pool                                                                   |
| `network, pool(image_cdn)`          | `network_on_image_cdn_pool`              | dedicated pool                                                                   |
| `network, pool(ai)`                 | `ai_network`                             | AI pool                                                                          |
| `control, context`                  | `control_with_context`                   | body receives `command_context`                                                  |
| `wrap(ai)`                          | `ok_ai(body)`                            | body returns `anyhow::Result`                                                    |
| `wrap(raw)` (default is `ok`)       | raw body                                 | body already returns `HostCommandResult`                                         |

`app: AppHandle` is always the first parameter and is the host handle, not a
payload field. When the body references `app` or `debug_logging_state`, the
macro injects `let app = ctx.app.clone();` / `let debug_logging_state =
ctx.debug_logging_state.clone();` respectively.

**Exception**: `save_mod_i18n_files` computes its resource lock at runtime
(`mutation_with_resource_resolver`), which the macro does not model. It stays
hand-written.

## Why drift cannot regress (self-proof)

- **Wire contract is single-sourced**: the macro derives the envelope struct,
  `const NAME`, the `impl HostCommand` and the wrapper from one function
  signature; struct fields can no longer drift from wrapper args because they
  are the same declaration.
- **Policy is single-sourced**: it can only exist in the `#[host_command]`
  attribute; the sidecar arm contains no policy tokens and cannot be edited to
  add any without failing the generator (arm text must equal the canonical
  `resolve_typed::<crate::<module::path>::<Type>>(ctx, id, args)`).
- **Name is single-sourced**: `const NAME` is generated from the function
  name; the arm name must equal the function name (wire-set check). The macro
  rejects names outside `[a-z][a-z0-9_]*` (snake_case) and the generator
  fails loudly on any attribute whose function it cannot parse, so a binding
  can never silently drop out of the routing tables.
- **Params type is single-sourced**: the generator derives
  `PascalCase(wire_name) + "Params"` with the same case conversion as the
  macro; both are pinned by tests (`generate-host-commands.test.mjs` and the
  proc-macro unit tests).
- **Option semantics cannot regress**: the macro adds `#[serde(default)]`
  exactly for `Option` fields.
- `HOST_COMMANDS`, `generate_handler!` and the architecture tests keep
  scanning the source; `scanRustCommands` covers both the `#[host_command]`
  attribute form and the hand-written `#[tauri::command]` form.

## Migration state

171 of 172 host commands use the `#[host_command]` attribute form;
`save_mod_i18n_files` stays hand-written (runtime resource resolver). The
legacy `arg`/`optional_arg` path and `execute_tauri_command` are deleted.
Sidecar unit tests inspect policy through `typed_command_binding`; policy
lives exclusively in the attribute bindings.

## Where things live

- `host-command-macros/` — the proc-macro crate (`#[proc_macro_attribute]`):
  parses the attribute grammar, expands one function into struct + impl +
  wrapper. Self-contained (syn/quote only), unit-tested in-crate.
- `host_runtime.rs` — typed command binding section: `HostCommand` trait,
  `DispatchContext`, `ResolvedCommandOrResponse`, the lane/pool/resource
  selection builders, `ok`, and the Tauri in-process entry (`execute`,
  response writer, runtime singleton — formerly `commands/runtime.rs`).
- `domain/ai/mod.rs` — `ok_ai`, next to `format_command_error`.
- `domain/<area>/commands.rs` — per command: the attributed function
  (attribute = policy, signature = wire contract, body = domain call), living
  next to the domain logic it invokes. The one resource-resolver command
  (`domain/mods/commands.rs::save_mod_i18n_files`) keeps its hand-written
  struct + impl + wrapper. Bindings outside `domain` live at
  `infrastructure/game_formats/xact/commands.rs` and
  `support/logging/commands.rs`; single-file domains became directories
  (`app_ui`, `mods`, `debug_bridge`, `resource_registry`) so every binding
  file is a `commands.rs` next to its domain module.
- `sidecar.rs` — `resolve_typed` plus the generator-owned routing match
  (regenerated like lib.rs; drift checks are whitespace-insensitive).
- `scripts/generate-host-commands.mjs` — recursively scans the src tree for
  `commands.rs` files, derives each command's module path and the sidecar
  pointer params type, and regenerates `HOST_COMMANDS` + `generate_handler!` +
  the sidecar routing block.
