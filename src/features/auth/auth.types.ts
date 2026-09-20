/**
 * What the client is allowed to know about an account.
 *
 * Deliberately narrow: no password hash, no salt, no session rows, no failed
 * attempt counters. The Query cache is serialised into the HTML (PLAN.md 4.7,
 * vector 3), so anything here is effectively public to the account's own
 * browser -- and nothing else may be.
 */
export interface User {
  id: string
  /** Null until the account is claimed by signing up. */
  email: string | null
  /** True while the account exists only behind a session cookie. */
  isGuest: boolean
  createdAt: string
}

/** Resolved from the session cookie on every server call that needs identity. */
export interface Viewer {
  userId: string
  email: string | null
  isGuest: boolean
}
