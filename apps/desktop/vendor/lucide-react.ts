/**
 * Dev-mode plugin vendor facade: re-exports the host's lucide-react instance
 * so code-package plugins share it via the import map (production emits the
 * same facade as a bundled vendor entry). ESM — `export *` suffices.
 */
export * from 'lucide-react'
