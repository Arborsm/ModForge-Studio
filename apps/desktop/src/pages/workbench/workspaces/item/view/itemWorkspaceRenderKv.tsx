export function RenderKv({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv-row compact-kv-row">
      <span>{label}</span>
      <span className="max-w-[62%] truncate text-right">{value}</span>
    </div>
  )
}
