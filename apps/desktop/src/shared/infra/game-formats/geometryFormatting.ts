/** @file Helpers that format Rust-side geometry structs (X/Y/Width/Height) into display strings. */

/** Formats a `{ X, Y }` point as `"X, Y"`, or returns `fallback` when null. */
export function formatPoint(value: { X: number; Y: number } | null, fallback: string) {
  return value ? `${value.X}, ${value.Y}` : fallback
}

/** Formats a `{ X, Y, Width, Height }` rect as `"X, Y / Width x Height"`, or returns `fallback` when null. */
export function formatRect(value: { X: number; Y: number; Width: number; Height: number } | null, fallback: string) {
  return value ? `${value.X}, ${value.Y} / ${value.Width} x ${value.Height}` : fallback
}
