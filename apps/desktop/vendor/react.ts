/**
 * @file Dev-mode vendor facade for the plugin import map. Re-exports the host's
 * React instance as a real ESM module so `plugin://`-loaded code packages can
 * `import React from 'react'` and share the host's singleton. Served via the
 * pluginVendorDevMiddleware redirect in vite.config.ts. The production entry is
 * a generated virtual module (pluginVendorFacadePlugin) that derives this same
 * name list from the installed package at build time. The list is explicit
 * because `@types/react` uses `export =` (no `export *`), and React is CJS so
 * rolldown cannot enumerate star-export names statically. Undocumented runtime
 * internals not present in the types (e.g. `__COMPILER_RUNTIME`) are omitted on
 * purpose — plugins must not import them. When upgrading React, sync this list
 * with the generated facade's names.
 */
export {
  Activity,
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  cache,
  cacheSignal,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  use,
  useActionState,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version,
} from 'react'
export { default } from 'react'
