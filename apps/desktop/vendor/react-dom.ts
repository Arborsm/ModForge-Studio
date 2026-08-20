/**
 * @file Dev-mode vendor facade for the plugin import map (see react.ts for the
 * mechanism; production uses a generated virtual module with explicit named
 * exports because react-dom is CJS).
 */
export * from 'react-dom'
export { default } from 'react-dom'
