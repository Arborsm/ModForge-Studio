import { describe, expect, it } from 'vite-plus/test'
import { getScaleUpFrameCount, getScaleUpFramePreviewMetrics } from '@pages/workbench/workspaces/mod/state/scaleup/scaleup'

describe('ScaleUp preview metrics', () => {
  it('uses original sheet dimensions to count frames in a resized result', () => {
    expect(
      getScaleUpFrameCount(
        { resultImage: { width: 512, height: 256 }, originalImage: { width: 128, height: 64 } },
        { frameWidth: 64, frameHeight: 64 },
      ),
    ).toBe(2)
  })

  it('returns zero frames when no image dimensions are available', () => {
    expect(getScaleUpFrameCount()).toBe(0)
  })

  it('scales a resized frame back to preview size and advances its crop', () => {
    expect(
      getScaleUpFramePreviewMetrics({ resultImage: { width: 512, height: 256 }, originalImage: { width: 128, height: 64 } }, 1, {
        frameWidth: 64,
        frameHeight: 64,
      }),
    ).toEqual({ frameWidth: 64, frameHeight: 64, frameX: 64, frameY: 0, sheetWidth: 128, sheetHeight: 64 })
  })
})
