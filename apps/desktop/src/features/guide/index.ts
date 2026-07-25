export {
  GUIDE_PROGRESS_MODULE_KEY,
  findGuideForSurface,
  indexGuideDefinitions,
  normalizeCompletedGuideIds,
  readCompletedGuideIds,
} from './model/guideProgress'
export { resetGuideEngineForTest, useGuideEngineStore, type GuideReplayRequest } from './model/guideEngine'
export {
  resolveGuideCardLayout,
  type GuideAnchorRect,
  type GuideCardArrow,
  type GuideCardLayout,
  type GuideCardLayoutInput,
  type GuideCardSize,
} from './model/guidePositioning'
