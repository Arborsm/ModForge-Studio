export type LinuxCudaRuntimeSelection = {
  version: string | null
  reason: 'detected' | 'cpu-fallback' | 'unversioned'
}

export function selectLinuxCudaRuntime(options?: {
  environment?: NodeJS.ProcessEnv
  loaderNames?: Set<string>
  searchDirectories?: string[]
}): LinuxCudaRuntimeSelection

export function resolveLinuxOrtSidecar(
  binDirectory: string,
  environment?: NodeJS.ProcessEnv,
): LinuxCudaRuntimeSelection & {
  path: string
  libraryDirectories: string[]
}
