/**
 * @file Desktop host API for directory-pack entry I/O: list, read and write
 * pack entries under a compat plugin's declared source directory.
 * @module features/compat-plugins
 */
import { HOST_COMMANDS } from '@platform/host-commands'
import { invokeDesktop } from '@platform/host/runtime'
import type { HostCommandPolicy } from '@platform/host-command-client'

/** One entry summary returned by `listCompatPluginEntries`. */
export type CompatPluginEntrySummary = {
  id: string
  entryDir: string
  entryFilePath: string
  entryImagePath: string | null
}

/** Request payload for `listCompatPluginEntries`. */
export type ListCompatPluginEntriesRequest = {
  modRoot: string
  rootSubdir: string
  entryFile: string
  entryImage?: string
}

/** Request payload for `readCompatPluginEntry`. */
export type ReadCompatPluginEntryRequest = {
  modRoot: string
  rootSubdir: string
  entryId: string
  entryFile: string
}

/** Result of reading one directory-pack entry. */
export type ReadCompatPluginEntryResult = {
  entryFilePath: string
  content: Record<string, unknown>
}

/** Request payload for `writeCompatPluginEntry`. */
export type WriteCompatPluginEntryRequest = {
  modRoot: string
  rootSubdir: string
  entryId: string
  entryFile: string
  content: Record<string, unknown>
}

export type DeleteCompatPluginEntryRequest = Omit<ReadCompatPluginEntryRequest, 'entryFile'>

export type WriteCompatPluginEntryImageRequest = Omit<ReadCompatPluginEntryRequest, 'entryFile'> & {
  imageFile: string
  contentBase64: string
}

const directoryPackIoPolicy = { kind: 'keyedLatest', key: 'compat-plugin-entry' } satisfies HostCommandPolicy
const directoryPackMutationPolicy = { kind: 'exclusiveMutation', resource: 'CompatPluginEntry' } satisfies HostCommandPolicy

/** Lists pack entries under a directory-pack source. */
export function listCompatPluginEntries(request: ListCompatPluginEntriesRequest) {
  return invokeDesktop<CompatPluginEntrySummary[]>(
    HOST_COMMANDS.listCompatPluginEntries,
    { request },
    { ...directoryPackIoPolicy, key: `compat-plugin-entries:${request.modRoot}:${request.rootSubdir}` },
  )
}

/** Reads one pack entry's JSON content. */
export function readCompatPluginEntry(request: ReadCompatPluginEntryRequest) {
  return invokeDesktop<ReadCompatPluginEntryResult>(
    HOST_COMMANDS.readCompatPluginEntry,
    { request },
    { ...directoryPackIoPolicy, key: `compat-plugin-entry:${request.modRoot}:${request.rootSubdir}:${request.entryId}` },
  )
}

/** Writes one pack entry's JSON content atomically. */
export function writeCompatPluginEntry(request: WriteCompatPluginEntryRequest) {
  return invokeDesktop<void>(HOST_COMMANDS.writeCompatPluginEntry, { request }, directoryPackMutationPolicy)
}

/** Deletes one complete pack entry directory. */
export function deleteCompatPluginEntry(request: DeleteCompatPluginEntryRequest) {
  return invokeDesktop<void>(HOST_COMMANDS.deleteCompatPluginEntry, { request }, directoryPackMutationPolicy)
}

/** Writes one validated base64-encoded pack entry image. */
export function writeCompatPluginEntryImage(request: WriteCompatPluginEntryImageRequest) {
  return invokeDesktop<void>(HOST_COMMANDS.writeCompatPluginEntryImage, { request }, directoryPackMutationPolicy)
}
