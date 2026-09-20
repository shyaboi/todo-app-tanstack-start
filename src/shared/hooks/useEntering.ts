import { useEffect, useState } from 'react'

/**
 * Whether this element is arriving, or was simply part of the page.
 *
 * The design asks for two things that look contradictory: a row should
 * *arrive* rather than appear (PLAN.md 8.4d), and **nothing animates on
 * load** (§4.6). CSS cannot tell the two apart -- a keyframe attached at
 * mount runs for the twenty rows that were already on screen when the page
 * painted, which is exactly the entrance the token contract forbids.
 *
 * So: one flag, flipped once after the first paint, read once per element at
 * mount. Before the flip an element is part of the page; after it, an element
 * is something that just arrived.
 *
 * The same shape as `bootRedirectsToBoard` in task.lastView, and for the same
 * reason -- "has the app finished starting" is not something a component can
 * work out from its own props.
 */

let painted = false
let scheduled = false

function schedulePaint(): void {
  if (scheduled || typeof requestAnimationFrame === 'undefined') return
  scheduled = true
  // After the paint, not during it: everything on screen stays still.
  requestAnimationFrame(() => {
    painted = true
  })
}

/** Resets the module flag. Tests only -- paint state is global by nature. */
export function resetPaintedForTests(): void {
  painted = false
  scheduled = false
}

export function useEntering(): boolean {
  /* Read once, at mount, and never again. A later re-render must not turn an
     entrance on for an element that has been sitting there -- that is the bug
     this hook exists to prevent, not a case it tolerates. */
  const [entering] = useState(() => painted)
  useEffect(schedulePaint, [])
  return entering
}
