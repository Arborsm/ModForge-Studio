/**
 * @file Shared SDK primitives consumed by both the hand-written public surface
 * (`index.ts`) and the generated host-component mirror types
 * (`host-components.generated.ts`). They live in their own module so the
 * generated file can import them without creating a circular dependency with
 * `index.ts`; `index.ts` re-exports them so `@modforge/plugin-sdk` keeps the
 * same public names.
 */

/** Minimal React component type. The `any` return keeps components usable as JSX
 * elements without importing react types (react is an optional peer; the SDK
 * never hard-depends on it in type position). */
export type ReactComponentType<P = Record<string, unknown>> = (props: P) => any

/** Minimal React node alias for plugin component props. Accepts any renderable
 * value (JSX, string, number, null/undefined, arrays of these) — mirrors the
 * host's ReactNode without a react types dependency. */
export type PluginReactNode = any
