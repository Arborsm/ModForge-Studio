/**
 * Dev-mode plugin vendor facade: re-exports the host's @dnd-kit/utilities
 * instance so code-package plugins share it via the import map (production
 * emits the same facade as a bundled vendor entry). ESM — `export *` suffices.
 */
export * from '@dnd-kit/utilities'
