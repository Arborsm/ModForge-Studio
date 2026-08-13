import { describe, expect, it } from 'vite-plus/test'
import { computeWaveformPeaks, formatAudioTime } from '@pages/workbench/workspaces/audio/state/audioWaveform'

describe('computeWaveformPeaks', () => {
  it('returns an empty array for empty channels or non-positive bucket counts', () => {
    expect(computeWaveformPeaks([], 8)).toEqual([])
    expect(computeWaveformPeaks([new Float32Array(0)], 8)).toEqual([])
    expect(computeWaveformPeaks([new Float32Array(16)], 0)).toEqual([])
  })

  it('normalizes bucket peaks against the loudest bucket', () => {
    const samples = new Float32Array(100)
    samples.fill(0.1, 0, 50)
    samples.fill(0.5, 50, 100)
    const peaks = computeWaveformPeaks([samples], 2)
    expect(peaks).toHaveLength(2)
    expect(peaks[1]).toBe(1)
    expect(peaks[0]).toBeCloseTo(0.2, 5)
  })

  it('uses absolute values so negative excursions still peak', () => {
    const samples = new Float32Array(10)
    samples[4] = -1
    const peaks = computeWaveformPeaks([samples], 10)
    expect(peaks[4]).toBe(1)
    expect(peaks[0]).toBe(0)
  })

  it('takes the maximum across channels', () => {
    const left = new Float32Array(10)
    const right = new Float32Array(10)
    right[7] = 0.8
    const peaks = computeWaveformPeaks([left, right], 10)
    expect(peaks[7]).toBe(1)
  })

  it('returns zeros for silent input instead of dividing by zero', () => {
    expect(computeWaveformPeaks([new Float32Array(32)], 4)).toEqual([0, 0, 0, 0])
  })

  it('never leaves a bucket empty when buckets outnumber samples', () => {
    const peaks = computeWaveformPeaks([new Float32Array(3).fill(0.5)], 10)
    expect(peaks).toHaveLength(10)
    expect(peaks.every((value) => value === 1)).toBe(true)
  })
})

describe('formatAudioTime', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatAudioTime(58)).toBe('0:58')
    expect(formatAudioTime(65.9)).toBe('1:05')
    expect(formatAudioTime(600)).toBe('10:00')
  })

  it('reads 0:00 for zero, negative, and non-finite input', () => {
    expect(formatAudioTime(0)).toBe('0:00')
    expect(formatAudioTime(-3)).toBe('0:00')
    expect(formatAudioTime(Number.NaN)).toBe('0:00')
    expect(formatAudioTime(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
})
