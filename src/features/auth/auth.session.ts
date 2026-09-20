import '@tanstack/react-start/server-only'
import { createHash, randomBytes } from 'node:crypto'
import {
  deleteCookie,
  getCookie,
  setCookie,
} from '@tanstack/react-start/server'

export const COOKIE_NAME = 'tasker_session'

/** 30 days, refreshed while the session is in use. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/* TanStack Start also ships `useSession`, which seals data INTO the cookie.
   That is deliberately not used here: a sealed cookie cannot be revoked before
   it expires, and revocation is the property this design is built around
   (PLAN.md 4.8). The cookie carries an opaque id and nothing else, so the
   server decides on every request whether it still means anything. */

/** 256 bits, so guessing is not a threat model. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * The cookie holds the token; the database holds only this hash.
 *
 * Unsalted SHA-256 is correct here, unlike for a password: the input is 256
 * bits of uniform randomness, so there is no dictionary to precompute and
 * nothing for a salt to defend against. It is fast on purpose -- this runs on
 * every authenticated request.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function readSessionCookie(): string | undefined {
  return getCookie(COOKIE_NAME)
}

export function writeSessionCookie(token: string, expiresAt: Date): void {
  setCookie(COOKIE_NAME, token, {
    // JavaScript cannot read it, so XSS cannot lift the session.
    httpOnly: true,
    /* Lax, not Strict. Strict drops the cookie when arriving from an external
       link, which signs people out for no security gain here; Lax still blocks
       the cross-site form post that CSRF depends on. */
    sameSite: 'lax',
    // Plain http exists only in local development.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export function clearSessionCookie(): void {
  deleteCookie(COOKIE_NAME, { path: '/' })
}
