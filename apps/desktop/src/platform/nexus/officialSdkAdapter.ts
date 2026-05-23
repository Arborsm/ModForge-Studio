export const NEXUS_OFFICIAL_SDK_PACKAGE = '@nexusmods/nexus-api' as const
export const NEXUS_OFFICIAL_SDK_VERSION = '1.1.5' as const

export type NexusOfficialSdkRuntime = 'node-cjs'

export type NexusOfficialSdkAdapterMetadata = {
  packageName: typeof NEXUS_OFFICIAL_SDK_PACKAGE
  version: typeof NEXUS_OFFICIAL_SDK_VERSION
  runtime: NexusOfficialSdkRuntime
  browserBundleSafe: false
  hostAdapter: 'tauri-rust'
}

export function getNexusOfficialSdkAdapterMetadata(): NexusOfficialSdkAdapterMetadata {
  return {
    packageName: NEXUS_OFFICIAL_SDK_PACKAGE,
    version: NEXUS_OFFICIAL_SDK_VERSION,
    runtime: 'node-cjs',
    browserBundleSafe: false,
    hostAdapter: 'tauri-rust',
  }
}
