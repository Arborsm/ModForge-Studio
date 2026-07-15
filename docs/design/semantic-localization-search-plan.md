# Optional Semantic Localization Search

## 1. Objective

Add optional semantic search to the localization workflow without making a model a prerequisite. Lexical search must remain fully usable with no model installed. When semantic search is configured and indexed, official corpus search, translation-memory search, generative translation examples, and fuzzy translation-memory context use semantic-first hybrid retrieval.

This document is the implementation fact source for the feature. It supplements `docs/design/ai-localization-plan.md`; where retrieval behavior differs, this document takes precedence.

## 2. Existing Download Capability

`domain/launcher/downloads.rs` already streams downloads in 64 KiB chunks, supports cancellation, and emits downloaded bytes, total bytes, and average speed. It is not reusable as a localization API because it is coupled to Nexus authentication, Launcher queue state, archive naming, and installation. It also writes directly to the final file and has no `.part` files, HTTP Range resume, SHA-256 verification, or safe model activation.

Extract the technical streaming loop into `infrastructure/http/resumable_download`. Launcher and localization remain separate domains and call the shared infrastructure through their own domain APIs and Host commands. Do not expose a generic arbitrary-URL/arbitrary-path Host command.

The shared Rust API includes:

- `ResumableDownloadRequest`: HTTP request inputs, destination, expected size, expected SHA-256, version identity, and partial-retention policy.
- `ResumableDownloadProgress`: current file, phase, downloaded and total bytes, percentage, rolling bytes per second, file index, and file count.
- `ResumableDownloadResult`: installed path, verified size and digest, resume state, and response validators.
- Injected cancellation and progress callbacks so each domain retains its own job ownership and event protocol.

Download behavior is fixed:

- Write beside the destination using a `.part` file and persist ETag, Last-Modified, expected size, and version identity.
- Resume with `Range` and `If-Range`. Append only after a valid `206 Content-Range` response.
- If a server ignores Range and returns `200`, truncate safely and restart. Reject inconsistent Content-Range, unexpected `416`, or changed validators.
- Model pause, network failure, and application exit preserve partial data. Launcher may retain its existing cancel-and-delete behavior through the caller policy.
- After streaming, run full size and SHA-256 verification, then `flush` and `sync_all`. Delete corrupt partial data after verification failure.
- Download model files into a versioned staging directory. After every file and the ONNX/tokenizer manifest pass validation, rename the staging directory to an immutable version directory and atomically switch a small active manifest. Keep the previous active model until activation succeeds.
- Built-in manifests may list multiple fixed, reviewed origins for the same pinned revision (currently Hugging Face and `hf-mirror.com`). Origin fallback never changes the expected size or SHA-256 and never accepts a user-supplied URL.
- Emit progress no more than every 100 ms, plus mandatory initial and final events.

## 3. Product Modes And Configuration

Semantic search is optional and has four mutually exclusive modes:

1. `lexical`: default, no model or network required.
2. `builtin`: downloaded `intfloat/multilingual-e5-small`, 384 dimensions.
3. `local-onnx`: a user-selected SentenceTransformers-compatible ONNX directory.
4. `remote-openai`: an OpenAI-compatible `/embeddings` profile.

Add a persistent semantic-search configuration section at the top of Application Settings > AI/translation, before generative AI and traditional MT profiles. Its sticky summary remains visible while scrolling and shows active mode, availability, download state, model identity, cache size, semantic-index coverage, pending records, and active progress.

Built-in model controls include download, pause, resume, retry, verify, delete, and open model directory. Progress shows job ID, model ID, current file, phase, downloaded/total bytes, percentage, rolling speed, and file number.

Local ONNX configuration selects a directory and validates the ONNX file, tokenizer files, pooling configuration, normalization, output dimension, and a content fingerprint. Missing or changed files make the model unavailable without breaking lexical search.

Remote embedding profiles have separate settings from chat models: name, HTTPS or loopback base URL, model, API key stored in keychain or an environment variable, and a connection test. Before every full remote index or pending-record synchronization, show the record count, estimated batches, and a clear disclosure that official source text and translation memory will be uploaded. Continue only after explicit confirmation.

Official corpus and translation-memory pages show a compact `lexical`, `semantic`, or `partial` status and a link to configuration. They do not duplicate model forms.

## 4. Semantic Storage And Retrieval

Store all derived vectors in a separate `localization-semantic.sqlite3`. It is disposable and rebuilt directly; do not migrate or dual-write old vector schemas. Official corpus and user-knowledge databases remain authoritative and usable when the semantic database is absent, stale, corrupt, or built for a different model.

The semantic generation identity includes model source, model fingerprint, dimensions, embedding-template version, official active revision, and knowledge revisions. Switching models immediately disables incompatible vectors and falls back to lexical search. Activate a new semantic generation only after every requested vector has committed successfully and source revisions still match the snapshot.

Official vector identity is stable across corpus rebuilds. Derive each source ID from the normalized asset path and unit key rather than a disposable SQLite row ID. Store a separate content fingerprint over every effective embedding input; unchanged sources retain coverage when the official generation revision changes, changed sources are re-embedded, and deleted or out-of-scope sources remove their orphan vectors. Coverage and pending counts are calculated against the current authoritative source set, never against stale vector rows.

Baseline lexical search uses FTS5 BM25, normalized exact text, token boundaries, and asset/key identifier boosts. Remove character-set Jaccard scoring. A query for `Sam` must not rank the substring in `same` above whole-token or key matches.

When semantic data is available, merge vector KNN and FTS candidates. Ranking is deterministic:

1. Exact normalized source text or unit key.
2. Whole-token source text, asset, or key identifier matches.
3. Remaining results by `0.80 * semantic_similarity + 0.20 * lexical_score`.

Discard non-exact semantic candidates below cosine `0.80`. Use at most five official prompt examples and three fuzzy translation-memory examples per source item.

Create one official vector per unit from canonical `en-US` source text plus unit kind, asset path, and unit key context. Embed source text and metadata context separately, fuse their normalized vectors at `98% source + 2% context`, normalize again, and include the fusion template version in generation identity. Metadata is a tie-break signal and must not distort short source strings. The multilingual model provides cross-language query alignment while returned source/target text still follows the requested locale pair.

Structured character data may contribute auxiliary `official-entity` vectors without becoming prompt examples. Character schedules contribute action identifiers only; character profiles map stable activity identifiers to a deterministic multilingual ontology, including aliases for music, guitar, band, skateboarding, games, sports, reading, painting, dance, gardening, and similar discriminative activities. Routine noise such as sleeping, standing, and generic work is excluded. Schedule rows and control-code- or placeholder-dominated strings are never generative prompt examples.

Entity retrieval expands a matched character identity to current `Characters/Dialogue/<name>` units and reranks those units using both entity evidence and the unit embedding. When entity evidence is stronger, use `70% entity similarity + 30% unit similarity` before the public hybrid formula; exact and whole-token priority still wins. Candidate expansion may inspect a larger bounded KNN window, but the public page size and prompt-example limits remain fixed.

Exact translation-memory matches continue to complete translation locally. Only generative AI receives semantic fuzzy-memory and official-example context. Traditional MT and terminology enforcement remain deterministic and do not use semantic matches.

Built-in and local-model modes update vectors synchronously for small translation-memory mutations; bulk import and automatic recording use cancellable incremental jobs. Remote mode never uploads new knowledge implicitly: changed records become pending, existing compatible vectors remain usable, and pending records participate through lexical recall until the user confirms synchronization.

Local embedding inference does not create usage-ledger events. Remote embedding requests record provider-reported tokens, latency, failures, profile, and operations `semantic-index` or `semantic-query`, without storing request or response text.

## 5. Contracts And Runtime Binding

Add typed DTOs for semantic settings, model status, index status, remote profiles, model download progress, index progress, and privacy-confirmed synchronization. Search results expose `score`, `semanticSimilarity`, `lexicalSimilarity`, `matchKind`, and `retrievalMode`. Knowledge trace adds semantic match count and effective retrieval mode without corpus text.

Extend `LocalizationPort` with semantic settings load/save, model inspect/download/pause/delete, model-directory selection, remote connection testing, semantic index rebuild/sync, and progress listeners.

Host commands remain wrappers. `sidecar.rs::resolve_command` remains the single binding point:

- Settings and status reads: Io lane with `keyedLatest` policy.
- Built-in download and remote connection test: Network lane with a semantic-model resource lock and `serviceGate` policy.
- Settings save, model delete, and semantic generation activation: Mutation lane with explicit resources.
- Index rebuild and synchronization: bounded `AiSemanticIndexing` execution pool with cancellation and semantic-index/model resources.
- Semantic searches: bounded execution pool with maximum concurrency two; frontend ownership remains `keyedLatest`.

Launcher keeps its current Host commands and event contract but delegates byte streaming to the shared downloader. Localization never imports Launcher domain code. Frontend configuration stays in the existing AI Settings composition; search views consume only the injected `LocalizationPort`, preserving Host Runtime and FSD boundaries.

## 6. Error And Recovery Behavior

All model, download, remote-provider, index, and validation failures map to typed AI/localization errors and localized notifications. Never silently report semantic mode when a query used only lexical retrieval.

Unavailable or stale semantic state is non-fatal: lexical search remains available and the persistent configuration summary explains the state and recovery action. Download or index cancellation is not reported as a backend failure. A failed model activation preserves the previous active model; a failed semantic generation never becomes active.

## 7. Tests And Real Validation

The shared downloader uses a local HTTP test server to cover first download, valid Range resume, ignored Range, invalid Content-Range, validator changes, unexpected `416`, pause/resume, connection loss, concurrent ownership, and progress throttling. Cover successful and failed SHA-256 verification, corrupt-part cleanup, disk failure, staging recovery, active-manifest switching, and previous-version retention.

Launcher regression tests prove existing progress, cancellation cleanup, filename handling, Nexus authentication, manual-download fallback, and automatic installation remain unchanged after extraction.

Semantic Rust tests cover no-model lexical behavior, hybrid ranking, thresholds, filters, deterministic ties, cross-language retrieval, model switching, partial coverage, local ONNX validation, remote batching/authentication/retry/usage, explicit upload confirmation, and generation cancellation. Translation-memory tests cover incremental synchronization, remote pending records, import/delete/copy behavior, exact-memory precedence, generative fuzzy context, and traditional-MT exclusion.

Frontend tests cover the persistent summary, four modes, every download progress field, pause/resume/retry, model validation, remote disclosure, index coverage, compact search status, Task Runtime cancellation, localized errors, and FSD/platform boundaries.

Real acceptance uses the installed Stardew Valley directory to rebuild and query the actual corpus. Verify `Sam` no longer promotes `same`, English paraphrases and Chinese queries retrieve relevant official dialogue, and local semantic queries meet the measured latency target. Reuse the downloaded built-in directory as a local external model. Exercise the remote profile against a local OpenAI-compatible embedding service. Use the repository-root Kimi test credential only for the already-authorized real translation test; do not assume its coding endpoint supports embeddings and never print or persist the key.

Run Host command generation, affected Vitest and architecture suites, Rust targeted and installed-game regressions, `vp run lint`, `vp run build`, Cargo format/check, and `git diff --check`. Report model size, resume evidence, verification results, indexing duration, coverage, query latency, real translation evidence, and every incomplete item.

## 8. Current Acceptance Baseline

The July 15, 2026 Windows acceptance run used the unpacked-game-free installation at `E:\SteamLibrary\steamapps\common\Stardew Valley` through the project XNB parser and Host Runtime. The official regression completed in 184.32 seconds. The active official generation contains 12,764 units with two parser errors. Rebuilding the same corpus changes its generation revision while stable semantic source IDs preserve full compatible-vector coverage.

The pinned built-in model uses the O4-quantized ONNX artifact from upstream revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`, activated as immutable local revision `614241f622f53c4eeff9890bdc4f31cfecc418b3-o4`. The ONNX file is 235,052,531 bytes with SHA-256 `4654c156f3e4171abc9c716cdb771bf9116455d15ac1aab364aeeede0e3205b0`; the complete active model is 252,136,526 bytes and produces 384-dimensional vectors. It was activated through the real sidecar Host Runtime after full manifest verification, while the previous model remained active until the manifest switch. The O4 semantic generation completed in approximately 4 minutes 12 seconds and contains 11,448 of 11,448 current sources, reports 100% coverage and zero pending records, and is non-stale. The full-precision and O4 artifacts were both loaded through the same local ONNX runtime: single-query debug inference measured 9,720 ms and 5,932 ms respectively, a roughly 39% reduction.

Through the rebuilt sidecar and real Host Runtime, the Chinese query `一个喜欢音乐和滑板的年轻人` returned Sam dialogue in each of the first five positions; the explicit guitar dialogue ranked third and the band/song dialogue ranked fifth. Grouped official and character-entity retrieval now shares one query embedding. In the unoptimized Windows debug sidecar, a cold-process query measured 7.59-7.93 seconds and a second query in the same resident process measured 1.59 seconds, replacing the earlier approximately 30-second baseline without reducing the observed retrieval quality.

Batch translation prompt enrichment embeds all source texts in one runtime call and then reuses each vector for the official-unit and character-entity KNN groups. A real 20-item prompt-example batch against the 11,448-record O4 generation measured 12.59 seconds cold and 6.49 seconds warm in the unoptimized Windows test binary, while returning five examples for every item. The retained deterministic regression asserts that three queries across two candidate groups invoke embedding once and KNN six times.

## 9. Operational Logging

Localization runtime logs use stable quoted `key=value` fields and the fixed targets `LocalizationTranslation`, `LocalizationKnowledge`, `LocalizationSemantic`, `LocalizationReview`, and `LocalizationMachineTranslation`. Common fields are emitted in deterministic order: event, job, engine, profile, provider, model, scope, item and character counts, operation, stage-specific counters, latency, usage, and failure category. Blank optional values are omitted.

`INFO` records task start/completion/cancellation and model or index lifecycle completion. `DEBUG` records knowledge-resolution totals, provider attempts, semantic embedding and KNN timings, retrieval mode, cache behavior, and batch decomposition. Retryable provider failures and telemetry/progress persistence failures use `WARN`. Final command failures remain exclusively owned by Host Runtime so the domain does not duplicate the same terminal error. Host command tracing remains controlled only by `MODFORGE_COMMAND_TRACE`; application backend debug logging controls the non-Host `DEBUG` records.

Operational logs never contain source text, translated text, prompts, provider response bodies, request headers, credentials, credential environment values, or complete semantic vectors. Item-level outcomes are aggregated; logs contain counts rather than per-item text. The SQLite usage ledger remains the persistent auditing source and is not replaced or duplicated by runtime logging.

The July 15 operational-log acceptance used the real O4 generation with 20 prompt queries and captured one `semantic.embedding.completed` record followed by one `semantic.knn.completed` record with `queries=20`, `candidateGroups=2`, `knnSearches=40`, and both elapsed-time fields. The temporary profiling entrypoint was removed after acceptance. The authorized Kimi smoke additionally captured the localization orchestrator lifecycle and provider attempt, verified job/profile/model/item/latency/token fields, and asserted that a unique source-body marker and the API key were absent from every captured localization log.

The repository-provided Kimi credential was read without logging or persisting it. The real ignored smoke test completed in 16.32 seconds and covered model listing, OpenAI-compatible and Anthropic-compatible connection tests, single and batched translation, Stardew placeholder preservation, progress events, cancellation, and translation-cache round-trip. The local OpenAI-compatible embedding server test separately proves authentication, retry after `429`, response-index ordering, dimensions, and provider-reported token usage; Kimi is not treated as an embedding provider.
