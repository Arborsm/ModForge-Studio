/**
 * @file Host capability registry for compat plugins.
 *
 * A capability id maps to a pure-function implementation that plugins opt into
 * by declaring the id in their manifest `contributions.capabilities` (a code
 * package then receives it via `ctx.capabilities.get(id)`).
 *
 * Discipline: every entry must either serve ≥2 plugins or be a clearly
 * generic ability. A capability written for exactly one plugin is a signal the
 * logic should stay plugin-side (third-layer code package) instead of growing
 * the host core. The architecture test
 * `src/tests/architecture/compatPluginCapabilityRegistry.test.ts` pins every
 * manifest-declared id to a key of this table.
 *
 * The table is intentionally empty. Sprite-sheet frame math, the previous
 * single entry, was confirmed to be a generic asset-format helper rather than
 * a plugin capability and now lives at
 * `shared/infra/asset-formats/spriteSheetFrameMath`; the capability mechanism
 * (manifest `capabilities` field, declaredCapabilities dispatch, Rust V8
 * validation, manifest schema) stays intact for future generic capabilities.
 */
export const COMPAT_CAPABILITIES: Record<string, unknown> = {}
