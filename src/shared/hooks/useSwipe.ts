import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/** How far a finger travels before a swipe counts. */
export const SWIPE_THRESHOLD_PX = 64
/** Vertical drift beyond which the gesture is a scroll, not a swipe. */
const SCROLL_TOLERANCE_PX = 24

/**
 * A horizontal touch swipe on an element (PLAN.md 7.3, swipe-to-done).
 *
 * Touch only: a mouse drag on a row would fight text selection, and the row
 * already has a visible control for the same action -- the design requires
 * one, and this hook is never the only way. Vertical movement cancels the
 * gesture so the list still scrolls under a finger.
 *
 * `dx` is the live offset for feedback while the finger is down; it goes back
 * to 0 on release, whether or not the swipe counted.
 */
export function useSwipe(
  onSwipe: (direction: 'left' | 'right') => void,
  threshold = SWIPE_THRESHOLD_PX,
) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; id: number } | null>(null)

  function end() {
    start.current = null
    setDx(0)
  }

  const handlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType !== 'touch') return
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const s = start.current
      if (!s || e.pointerId !== s.id) return
      const x = e.clientX - s.x
      const y = Math.abs(e.clientY - s.y)
      // Moving mostly up or down: hand the gesture back to scrolling.
      if (y > SCROLL_TOLERANCE_PX && Math.abs(x) < SCROLL_TOLERANCE_PX) {
        end()
        return
      }
      setDx(x)
    },
    onPointerUp: (e: ReactPointerEvent) => {
      const s = start.current
      if (!s || e.pointerId !== s.id) return
      const x = e.clientX - s.x
      end()
      if (Math.abs(x) >= threshold) onSwipe(x > 0 ? 'right' : 'left')
    },
    onPointerCancel: end,
  }

  return { dx, handlers }
}
