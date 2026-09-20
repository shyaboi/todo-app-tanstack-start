import { useSyncExternalStore } from 'react'

export type Platform = 'mac' | 'other'

/* The platform cannot be known during SSR, and the design requires the modifier
   glyph to be resolved per platform rather than hard-coded.
   `useSyncExternalStore` is the right tool: it renders the server snapshot on
   the server and the real value from the first client render, so React
   reconciles the difference itself. A `useEffect` + `setState` would render the
   wrong glyph, then patch it in a second pass; reading `navigator` during
   render would crash SSR outright (Failure Check 8). */

// The platform cannot change within a session, so there is nothing to observe.
const subscribe = () => () => {}

function getSnapshot(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  return /Mac|iPhone|iPad|iPod/.test(ua) ? 'mac' : 'other'
}

// Windows and Linux are the safer default: `Ctrl` shown to a Mac user reads as
// a mistake, whereas the reverse briefly shows an unfamiliar glyph.
const getServerSnapshot = (): Platform => 'other'

export function usePlatform(): Platform {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
