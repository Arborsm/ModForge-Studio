import { useRef, useEffect, useId, useState, type ReactNode, type MouseEvent, type KeyboardEvent } from 'react'

export interface GooeyNavItem {
  /** Visible label text. */
  label: string
  /** Optional href for the anchor; defaults to '#' when omitted. */
  href?: string
  /** Optional icon rendered before the label. */
  icon?: ReactNode
  /** Optional badge rendered after the label (e.g. notification count). */
  badge?: ReactNode
}

export interface GooeyNavProps {
  /** Navigation items to display. */
  items: GooeyNavItem[]
  /** Visual skin for the gooey pill and stage. @default 'dark' */
  variant?: 'dark' | 'light'
  /** Duration (ms) of the main pill transition. @default 600 */
  animationTime?: number
  /** Number of bubble particles per transition. @default 15 */
  particleCount?: number
  /** Outer and inner distances of bubble spread. @default [90, 10] */
  particleDistances?: [number, number]
  /** Radius factor influencing random particle rotation. @default 100 */
  particleR?: number
  /** Random time variance (ms) for particle animations. @default 300 */
  timeVariance?: number
  /** Color indices used when creating bubble particles. @default [1, 2, 3, 1, 2, 3, 1, 4] */
  colors?: number[]
  /** Which item is selected on mount (uncontrolled). @default 0 */
  initialActiveIndex?: number
  /**
   * Controlled active index.
   * When provided the component delegates active-state ownership to the parent.
   */
  activeIndex?: number
  /** Fires when the user clicks a nav item. Receives the item index. */
  onChange?: (index: number) => void
  /** Accessible label for the `<nav>` element. */
  ariaLabel?: string
  /** Additional class names appended to the root container. */
  className?: string
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const noise = (n = 1) => n / 2 - Math.random() * n

const getXY = (distance: number, pointIndex: number, totalPoints: number): [number, number] => {
  const angle = ((360 + noise(8)) / totalPoints) * pointIndex * (Math.PI / 180)
  return [distance * Math.cos(angle), distance * Math.sin(angle)]
}

const pickRandomColor = (colors: number[]) => colors[Math.floor(Math.random() * colors.length)]

interface Particle {
  start: [number, number]
  end: [number, number]
  time: number
  scale: number
  color: number
  rotate: number
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function GooeyNav({
  items,
  variant = 'dark',
  animationTime = 600,
  particleCount = 15,
  particleDistances = [90, 10],
  particleR = 100,
  timeVariance = 300,
  colors = [1, 2, 3, 1, 2, 3, 1, 4],
  initialActiveIndex = 0,
  activeIndex: controlledIndex,
  onChange,
  ariaLabel,
  className,
}: GooeyNavProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLUListElement>(null)
  const filterRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const reactId = useId()
  const gooeyFilterId = `gooey-nav-filter-${reactId.replace(/:/g, '')}`

  const [internalIndex, setInternalIndex] = useState(initialActiveIndex)
  const isControlled = controlledIndex !== undefined
  const activeIndex = isControlled ? controlledIndex : internalIndex

  /* ---------- particle factory ---------- */

  const createParticle = (i: number, t: number, d: [number, number], r: number): Particle => {
    const rotate = noise(r / 10)
    return {
      start: getXY(d[0], particleCount - i, particleCount),
      end: getXY(d[1] + noise(7), particleCount - i, particleCount),
      time: t,
      scale: 1 + noise(0.2),
      color: pickRandomColor(colors),
      rotate: rotate > 0 ? (rotate + r / 20) * 10 : (rotate - r / 20) * 10,
    }
  }

  const makeParticles = (element: HTMLElement) => {
    const d = particleDistances
    const r = particleR
    const bubbleTime = animationTime * 2 + timeVariance
    element.style.setProperty('--time', `${bubbleTime}ms`)

    for (let i = 0; i < particleCount; i++) {
      const t = animationTime * 2 + noise(timeVariance * 2)
      const p = createParticle(i, t, d, r)
      element.classList.remove('active')

      setTimeout(() => {
        const particle = document.createElement('span')
        const point = document.createElement('span')
        particle.classList.add('particle')
        particle.style.setProperty('--start-x', `${p.start[0]}px`)
        particle.style.setProperty('--start-y', `${p.start[1]}px`)
        particle.style.setProperty('--end-x', `${p.end[0]}px`)
        particle.style.setProperty('--end-y', `${p.end[1]}px`)
        particle.style.setProperty('--time', `${p.time}ms`)
        particle.style.setProperty('--scale', `${p.scale}`)
        particle.style.setProperty('--color', `var(--gooey-color-${p.color}, var(--gooey-active-bg))`)
        particle.style.setProperty('--rotate', `${p.rotate}deg`)

        point.classList.add('point')
        particle.appendChild(point)
        element.appendChild(particle)
        requestAnimationFrame(() => {
          element.classList.add('active')
        })
        setTimeout(() => {
          try {
            element.removeChild(particle)
          } catch {
            // particle already removed
          }
        }, t)
      }, 30)
    }
  }

  /* ---------- position sync ---------- */

  const updateEffectPosition = (element: HTMLElement) => {
    if (!containerRef.current || !filterRef.current || !textRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    const pos = element.getBoundingClientRect()

    const styles = {
      left: `${pos.x - containerRect.x}px`,
      top: `${pos.y - containerRect.y}px`,
      width: `${pos.width}px`,
      height: `${pos.height}px`,
    }
    Object.assign(filterRef.current.style, styles)
    Object.assign(textRef.current.style, styles)
    textRef.current.textContent = element.querySelector('.gooey-nav-item-label')?.textContent ?? element.textContent ?? ''
  }

  /* ---------- handlers ---------- */

  const handleClick = (e: MouseEvent<HTMLAnchorElement>, index: number) => {
    e.preventDefault()
    const liEl = e.currentTarget.parentElement
    if (!liEl || activeIndex === index) return

    if (!isControlled) {
      setInternalIndex(index)
    }
    onChange?.(index)

    updateEffectPosition(liEl)

    if (filterRef.current) {
      const particles = filterRef.current.querySelectorAll('.particle')
      particles.forEach((p) => filterRef.current?.removeChild(p))
    }

    if (textRef.current) {
      textRef.current.classList.remove('active')
      void textRef.current.offsetWidth
      textRef.current.classList.add('active')
    }

    if (filterRef.current) {
      makeParticles(filterRef.current)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const liEl = e.currentTarget.parentElement
      if (liEl) {
        handleClick({ currentTarget: e.currentTarget, preventDefault: () => undefined } as MouseEvent<HTMLAnchorElement>, index)
      }
    }
  }

  /* ---------- sync on mount & resize ---------- */

  useEffect(() => {
    if (!navRef.current || !containerRef.current) return
    const activeLi = navRef.current.querySelectorAll('li')[activeIndex]
    if (activeLi) {
      updateEffectPosition(activeLi)
      textRef.current?.classList.add('active')
    }

    const resizeObserver = new ResizeObserver(() => {
      const currentActiveLi = navRef.current?.querySelectorAll('li')[activeIndex]
      if (currentActiveLi) {
        updateEffectPosition(currentActiveLi)
      }
    })

    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [activeIndex])

  /* ---------- render ---------- */

  return (
    <div className={`gooey-nav-container${className ? ` ${className}` : ''}`} data-variant={variant} ref={containerRef}>
      <svg className="gooey-nav-svg-filter" aria-hidden="true" focusable="false">
        <filter id={gooeyFilterId}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
            result="gooey"
          />
          <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
        </filter>
      </svg>
      <nav aria-label={ariaLabel}>
        <ul ref={navRef}>
          {items.map((item, index) => (
            <li key={index} className={activeIndex === index ? 'active' : ''}>
              <a
                href={item.href ?? '#'}
                onClick={(e) => handleClick(e, index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                aria-current={activeIndex === index ? 'page' : undefined}
              >
                {item.icon ? <span className="gooey-nav-item-icon" aria-hidden="true">{item.icon}</span> : null}
                <span className="gooey-nav-item-label">{item.label}</span>
                {item.badge ? <span className="gooey-nav-item-badge" aria-hidden="true">{item.badge}</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <span className="effect filter" ref={filterRef} style={{ filter: `url(#${gooeyFilterId})` }} />
      <span className="effect text" ref={textRef} />
    </div>
  )
}
