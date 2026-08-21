/**
 * @file Vendor facade entry for the plugin import map. Re-exports the plugin
 * SDK (`@modforge/plugin-sdk`) as a real ESM module. The SDK is stateless
 * (types plus pure helpers), so inlining it into this entry is safe.
 */
export * from '@modforge/plugin-sdk'
