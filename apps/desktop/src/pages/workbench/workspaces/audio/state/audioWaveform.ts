/**
 * Pure waveform helpers for the audio workspace: peak extraction from decoded
 * PCM channel data and transport time formatting. No DOM dependencies.
 */

/**
 * Reduces decoded PCM channels into `bucketCount` absolute peaks normalized to
 * 0..1 against the loudest bucket. Returns an empty array when there is no
 * sample data; returns zeros for silent input (no division by zero).
 */
export function computeWaveformPeaks(channels: ArrayLike<number>[], bucketCount: number): number[] {
  const sampleCount = channels[0]?.length ?? 0
  if (sampleCount <= 0 || bucketCount <= 0) return []

  const samplesPerBucket = sampleCount / bucketCount
  const peaks = Array.from({ length: bucketCount }, () => 0)
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = Math.floor(bucket * samplesPerBucket)
    const end = Math.min(sampleCount, Math.max(start + 1, Math.floor((bucket + 1) * samplesPerBucket)))
    let peak = 0
    for (const channel of channels) {
      for (let index = start; index < end; index++) {
        const value = Math.abs(channel[index] ?? 0)
        if (value > peak) peak = value
      }
    }
    peaks[bucket] = peak
  }

  const max = peaks.reduce((highest, value) => Math.max(highest, value), 0)
  if (max <= 0) return peaks
  return peaks.map((value) => value / max)
}

/** Formats a transport timestamp as m:ss; non-finite or negative input reads 0:00. */
export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)
  return `${minutes}:${remaining.toString().padStart(2, '0')}`
}
