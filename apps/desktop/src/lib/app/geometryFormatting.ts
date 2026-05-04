export function formatPoint(value: { X: number; Y: number } | null, fallback: string) {
  return value ? `${value.X}, ${value.Y}` : fallback
}

export function formatRect(value: { X: number; Y: number; Width: number; Height: number } | null, fallback: string) {
  return value ? `${value.X}, ${value.Y} / ${value.Width} x ${value.Height}` : fallback
}
