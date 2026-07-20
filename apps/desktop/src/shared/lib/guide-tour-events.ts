const GUIDE_STEP_EVENT = 'modforge:guide-step'

export type GuideStepActivation = {
  guideId: string
  stepId: string
  anchor: string | null
}

/**
 * Announces the active guide step on window so pages can reveal the referenced
 * UI (expand a drawer, open a detail panel) without importing the guide engine.
 */
export function notifyGuideStepActivated(activation: GuideStepActivation) {
  window.dispatchEvent(new CustomEvent<GuideStepActivation>(GUIDE_STEP_EVENT, { detail: activation }))
}

/** Subscribes a page to guide step activations so it can prepare the anchored UI. */
export function listenForGuideStepActivations(listener: (activation: GuideStepActivation) => void) {
  const receive = (event: Event) => listener((event as CustomEvent<GuideStepActivation>).detail)
  window.addEventListener(GUIDE_STEP_EVENT, receive)
  return () => window.removeEventListener(GUIDE_STEP_EVENT, receive)
}
