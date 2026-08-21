/**
 * @file Dev-mode vendor facade for the plugin import map (see react.ts for the
 * mechanism; production uses a generated virtual module with explicit named
 * exports because the jsx-runtime is CJS). The list is explicit because
 * rolldown cannot interop a star re-export of a CJS module here — it would
 * silently drop the names and break plugin imports of `react/jsx-runtime`.
 * When upgrading React, sync this list with the generated facade's names.
 */
export { Fragment, jsx, jsxs } from 'react/jsx-runtime'
