import { describe, expect, it } from 'vite-plus/test'
import {
  ANDROID_DOWNLOAD_LOCATION_DEFAULT,
  ANDROID_DOWNLOAD_LOCATION_TOKENS,
  isAndroidDownloadLocationToken,
  normalizeAndroidDownloadLocation,
} from '@features/launcher/model/androidDownloadLocation'

describe('androidDownloadLocation', () => {
  it('recognizes the sandbox-folder tokens', () => {
    expect(ANDROID_DOWNLOAD_LOCATION_TOKENS).toEqual(['@downloads', '@picked'])
    expect(isAndroidDownloadLocationToken('@downloads')).toBe(true)
    expect(isAndroidDownloadLocationToken('@picked')).toBe(true)
  })

  it('rejects plain paths and empty values', () => {
    expect(isAndroidDownloadLocationToken('/storage/emulated/0/Android/data/com.modforge.android/files/Downloads')).toBe(false)
    expect(isAndroidDownloadLocationToken('C:\\Users\\test\\Downloads')).toBe(false)
    expect(isAndroidDownloadLocationToken('')).toBe(false)
    expect(isAndroidDownloadLocationToken(null)).toBe(false)
    expect(isAndroidDownloadLocationToken(undefined)).toBe(false)
  })

  it('keeps valid tokens and falls back to the default otherwise', () => {
    expect(normalizeAndroidDownloadLocation('@picked')).toBe('@picked')
    expect(normalizeAndroidDownloadLocation('@downloads')).toBe('@downloads')
    expect(normalizeAndroidDownloadLocation(null)).toBe(ANDROID_DOWNLOAD_LOCATION_DEFAULT)
    expect(normalizeAndroidDownloadLocation('')).toBe(ANDROID_DOWNLOAD_LOCATION_DEFAULT)
    expect(normalizeAndroidDownloadLocation('/legacy/sandbox/path')).toBe(ANDROID_DOWNLOAD_LOCATION_DEFAULT)
    expect(ANDROID_DOWNLOAD_LOCATION_DEFAULT).toBe('@downloads')
  })
})
