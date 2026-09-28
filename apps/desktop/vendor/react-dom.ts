/**
 * @file Dev-mode vendor facade for the plugin import map (see react.ts for the
 * mechanism; production uses a generated virtual module with explicit named
 * exports because react-dom is CJS). The list is explicit for the same reason
 * as react-jsx-runtime.ts — a star re-export of CJS loses the names here.
 * Undocumented internals (`__DOM_INTERNALS_*`) are omitted on purpose. When
 * upgrading React, sync this list with the generated facade's names.
 */
export {
  createPortal,
  flushSync,
  preconnect,
  prefetchDNS,
  preinit,
  preinitModule,
  preload,
  preloadModule,
  requestFormReset,
  unstable_batchedUpdates,
  useFormState,
  useFormStatus,
  version,
} from 'react-dom'
export { default } from 'react-dom'
