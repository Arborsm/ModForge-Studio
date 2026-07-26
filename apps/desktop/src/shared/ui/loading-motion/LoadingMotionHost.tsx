/**
 * Shared loading motion renderer for page-level presentation.
 *
 * This module now provides the shared loading motion environment
 * through context, plus a small set of pre-defined reveal controls
 * that pages can consume without threading preference props through
 * every intermediate layer.
 */

import {
  createElement,
  createContext,
  type CSSProperties,
  type HTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  useMemo,
  useContext,
} from 'react'
import {
  type LoadingMotionStage,
  type LoadingMotionIntensityId,
  type LoadingMotionSpeedMode,
  type LoadingMotionSpeedId,
  type ResolvedLoadingMotionConfig,
  type RevealItemMetadata,
  type LoadingMotionPreference,
  type LoadingMotionStyleId,
} from '@shared/lib/loading-motion'
import { DEFAULT_LOADING_MOTION_PREFERENCE, normalizeLoadingMotionPreference, resolveLoadingMotionConfig } from '@shared/lib/loading-motion'

type LoadingMotionContextValue = {
  provided: boolean
  preference: LoadingMotionPreference
  config: ResolvedLoadingMotionConfig
}

const LoadingMotionContext = createContext<LoadingMotionContextValue | null>(null)

type LoadingMotionAnchorInput = readonly string[] | null | undefined

function resolveMotionState(
  preference: Partial<LoadingMotionPreference> | LoadingMotionPreference | null | undefined,
  options?: {
    revealOrder?: readonly string[] | null
    anchors?: LoadingMotionAnchorInput
  },
): LoadingMotionContextValue {
  const normalizedPreference = normalizeLoadingMotionPreference(preference ?? null)
  const config = resolveLoadingMotionConfig(normalizedPreference, {
    revealOrder: options?.revealOrder ?? null,
    anchors: options?.anchors ? { anchorIds: options.anchors } : null,
  })

  return {
    provided: false,
    preference: normalizedPreference,
    config,
  }
}

const DEFAULT_LOADING_MOTION_STATE = resolveMotionState(DEFAULT_LOADING_MOTION_PREFERENCE, {
  revealOrder: null,
  anchors: null,
})

function useLoadingMotionContextValue() {
  const contextValue = useContext(LoadingMotionContext)
  return contextValue ?? DEFAULT_LOADING_MOTION_STATE
}

/* ------------------------------------------------------------------ */
/*  Host adapter hook - page hosts normalize their state through this  */
/* ------------------------------------------------------------------ */

export type PageLoadingState = {
  /** Current lifecycle stage of the page. */
  stage: LoadingMotionStage
  /** Optional user preference - when omitted, defaults are used. */
  preference?: Partial<LoadingMotionPreference> | null
  /** Optional reveal order for page sections. */
  revealOrder?: readonly string[] | null
  /** Optional anchor declarations (max 2). */
  anchors?: readonly string[]
  /** Reveal item metadata for fine-grained reveal control. */
  revealItems?: readonly RevealItemMetadata[]
}

/**
 * Normalize page-host loading state into the shared loading model.
 *
 * This is the single entry point for page hosts to feed their
 * readiness information into the shared abstraction. It converts
 * page-specific state into a ResolvedLoadingMotionConfig plus
 * reveal metadata that the renderer consumes.
 */
export function useLoadingMotionConfig(state: PageLoadingState): {
  config: ResolvedLoadingMotionConfig
  items: readonly RevealItemMetadata[]
} {
  const normalizedPreference = normalizeLoadingMotionPreference(state.preference ?? null)

  const config = resolveLoadingMotionConfig(normalizedPreference, {
    revealOrder: state.revealOrder ?? null,
    anchors: state.anchors ? { anchorIds: state.anchors } : null,
  })

  return {
    config,
    items: state.revealItems ?? [],
  }
}

/* ------------------------------------------------------------------ */
/*  Shared loading context                                             */
/* ------------------------------------------------------------------ */

export type LoadingMotionProviderProps = {
  preference?: Partial<LoadingMotionPreference> | null
  revealOrder?: readonly string[] | null
  anchors?: readonly string[] | null
  children: ReactNode
}

export function LoadingMotionProvider({ preference, revealOrder = null, anchors = null, children }: LoadingMotionProviderProps) {
  const value = useMemo(
    () => ({
      ...resolveMotionState(preference ?? null, {
        revealOrder,
        anchors,
      }),
      provided: true,
    }),
    [anchors, preference, revealOrder],
  )

  return <LoadingMotionContext.Provider value={value}>{children}</LoadingMotionContext.Provider>
}

export function useLoadingMotionPreference(): LoadingMotionPreference {
  return useLoadingMotionContextValue().preference
}

export function useResolvedLoadingMotion(preferenceOverride?: Partial<LoadingMotionPreference> | null): ResolvedLoadingMotionConfig {
  const current = useLoadingMotionContextValue()
  const mergedPreference = preferenceOverride
    ? normalizeLoadingMotionPreference({
        ...current.preference,
        ...preferenceOverride,
      })
    : current.preference

  if (!preferenceOverride) {
    return current.config
  }

  const anchorIds = current.config.anchors.filter((anchorId): anchorId is string => Boolean(anchorId))

  return resolveLoadingMotionConfig(mergedPreference, {
    revealOrder: current.config.revealOrder,
    anchors: anchorIds.length ? { anchorIds } : null,
  })
}

/* ------------------------------------------------------------------ */
/*  Shared renderer component                                          */
/* ------------------------------------------------------------------ */

export type LoadingMotionHostProps = {
  stage: LoadingMotionStage
  config: ResolvedLoadingMotionConfig
  children: ReactNode
  /** Placeholder content shown during loading/entering stages. */
  placeholder?: ReactNode
}

/**
 * Shared page-level loading renderer.
 *
 * Renders children or placeholder based on the lifecycle stage.
 * In ready/idle stages, children render directly (pass-through).
 * In entering/loading stages, the optional placeholder is shown.
 * In exiting stage, children are wrapped in an exit-ready container.
 *
 * This component is intentionally thin - it delegates animation
 * implementation to the shared CSS primitives.
 */
export function LoadingMotionHost({ stage, children, placeholder }: LoadingMotionHostProps) {
  if (stage === 'ready' || stage === 'idle') {
    return <>{children}</>
  }

  if (placeholder && (stage === 'entering' || stage === 'loading')) {
    return <>{placeholder}</>
  }

  return <>{children}</>
}

/* ------------------------------------------------------------------ */
/*  Suspense-compatible fallback helper                               */
/* ------------------------------------------------------------------ */

export type LoadingMotionFallbackProps = {
  styleId?: LoadingMotionStyleId
  intensityId?: LoadingMotionIntensityId
  speedMode?: LoadingMotionSpeedMode
  speedId?: LoadingMotionSpeedId
  speedMultiplier?: number
  className?: string
}

/* ------------------------------------------------------------------ */
/*  Section reveal helpers                                             */
/* ------------------------------------------------------------------ */

type LoadingMotionRevealStyle = CSSProperties & {
  '--loading-motion-reveal-index'?: number
  '--loading-motion-speed-multiplier'?: number
}

type LoadingMotionChildRevealStyle = CSSProperties & {
  '--loading-motion-child-index'?: number
}

type LoadingMotionIntrinsicElement = 'article' | 'aside' | 'button' | 'div' | 'header' | 'li' | 'main' | 'section' | 'span'

type LoadingMotionElementProps =
  | Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'type'>
  | Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>

export type LoadingMotionRevealProps<T extends LoadingMotionIntrinsicElement = 'div'> = LoadingMotionElementProps & {
  itemId: string
  index: number
  preference?: Partial<LoadingMotionPreference> | null
  preferenceOverride?: Partial<LoadingMotionPreference> | null
  className?: string
  as?: T
  children: ReactNode
}

export type LoadingMotionRevealDomProps = {
  className: string
  'data-loading-style': LoadingMotionStyleId
  'data-loading-intensity': LoadingMotionIntensityId
  'data-loading-speed': LoadingMotionSpeedId
  'data-loading-speed-mode': LoadingMotionSpeedMode
  'data-loading-section': string
  style: LoadingMotionRevealStyle
}

export type LoadingMotionChildRevealDomProps = {
  className: string
  style: LoadingMotionChildRevealStyle
}

function buildLoadingMotionRevealProps({
  itemId,
  index,
  config,
  className,
}: {
  itemId: string
  index: number
  config: ResolvedLoadingMotionConfig
  className?: string
}): LoadingMotionRevealDomProps {
  return {
    className: ['loading-motion-reveal', className].filter(Boolean).join(' '),
    'data-loading-style': config.styleId,
    'data-loading-intensity': config.intensityId,
    'data-loading-speed': config.speedId,
    'data-loading-speed-mode': config.speedMode,
    'data-loading-section': itemId,
    style: {
      '--loading-motion-reveal-index': index,
      '--loading-motion-speed-multiplier': config.speedMultiplier,
    },
  }
}

export function getLoadingMotionRevealProps({
  itemId,
  index,
  preference,
  className,
}: {
  itemId: string
  index: number
  preference?: Partial<LoadingMotionPreference> | null
  className?: string
}): LoadingMotionRevealDomProps {
  const config = resolveLoadingMotionConfig(normalizeLoadingMotionPreference(preference ?? null), {
    revealOrder: null,
  })

  return buildLoadingMotionRevealProps({ itemId, index, config, className })
}

export function getLoadingMotionChildRevealProps({
  index,
  className,
}: {
  index: number
  className?: string
}): LoadingMotionChildRevealDomProps {
  return {
    className: ['loading-motion-child-reveal', className].filter(Boolean).join(' '),
    style: {
      '--loading-motion-child-index': index,
    },
  }
}

export function LoadingMotionReveal<T extends LoadingMotionIntrinsicElement = 'div'>({
  itemId,
  index,
  preference,
  preferenceOverride,
  className,
  as,
  children,
  ...rest
}: LoadingMotionRevealProps<T>) {
  const Component = (as ?? 'div') as LoadingMotionIntrinsicElement
  const config = useResolvedLoadingMotion(preferenceOverride ?? preference ?? null)
  const revealProps = buildLoadingMotionRevealProps({ itemId, index, config, className })
  const elementProps =
    Component === 'button' && !('type' in rest) ? ({ type: 'button', ...rest } as LoadingMotionElementProps & { type?: 'button' }) : rest

  return createElement(Component, { ...elementProps, ...revealProps } as HTMLAttributes<HTMLElement>, children)
}

export type LoadingMotionRevealItemProps<T extends LoadingMotionIntrinsicElement = 'div'> = LoadingMotionElementProps & {
  index: number
  className?: string
  as?: T
  children: ReactNode
}

export function LoadingMotionRevealItem<T extends LoadingMotionIntrinsicElement = 'div'>({
  index,
  className,
  as,
  children,
  ...rest
}: LoadingMotionRevealItemProps<T>) {
  const Component = (as ?? 'div') as LoadingMotionIntrinsicElement
  const elementProps =
    Component === 'button' && !('type' in rest) ? ({ type: 'button', ...rest } as LoadingMotionElementProps & { type?: 'button' }) : rest

  return createElement(
    Component,
    { ...elementProps, ...getLoadingMotionChildRevealProps({ index, className }) } as HTMLAttributes<HTMLElement>,
    children,
  )
}

/**
 * A Suspense-compatible page-level loading fallback that exposes
 * the resolved style and intensity through deterministic data attributes
 * for testing and style hooking.
 *
 * This component now reads from the shared loading motion context by
 * default, while still allowing direct overrides for isolated tests.
 */
export function LoadingMotionFallback({
  styleId,
  intensityId,
  speedMode,
  speedId,
  speedMultiplier,
  className,
}: LoadingMotionFallbackProps) {
  const config = useResolvedLoadingMotion(
    styleId !== undefined || intensityId !== undefined || speedMode !== undefined || speedId !== undefined || speedMultiplier !== undefined
      ? {
          ...(styleId !== undefined ? { styleId } : {}),
          ...(intensityId !== undefined ? { intensityId } : {}),
          ...(speedMode !== undefined ? { speedMode } : {}),
          ...(speedId !== undefined ? { speedId } : {}),
          ...(speedMultiplier !== undefined ? { speedMultiplier } : {}),
        }
      : null,
  )

  return (
    <div
      className={['loading-motion-fallback', className].filter(Boolean).join(' ')}
      data-loading-style={config.styleId}
      data-loading-intensity={config.intensityId}
      data-loading-speed={config.speedId}
      data-loading-speed-mode={config.speedMode}
      style={{ '--loading-motion-speed-multiplier': config.speedMultiplier } as CSSProperties}
    >
      <div className="loading-motion-visual" aria-hidden="true" data-loader="signal">
        <span className="loading-motion-layer loading-motion-layer-primary" />
        <span className="loading-motion-layer loading-motion-layer-secondary" />
        <span className="loading-motion-layer loading-motion-layer-tertiary" />
      </div>
    </div>
  )
}
