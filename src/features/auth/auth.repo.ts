import '@tanstack/react-start/server-only'
import type { Collection, Document, ObjectId } from 'mongodb'
import { getDb } from '~/server/db'
import type { User } from './auth.types'

export interface UserDoc extends Document {
  /* Null while the account is a guest. A first visit creates one of these so
     tasks have an owner before anyone signs up; signing up CLAIMS the same row
     by filling these two fields, so the guest's tasks need no migration. */
  email: string | null
  /** `scrypt$N$r$p$salt$hash`. Null for a guest. Never leaves the server. */
  passwordHash: string | null
  createdAt: Date
  updatedAt: Date
  /** Lockout state, kept on the account rather than in a second datastore. */
  failedAttempts: number
  lockedUntil: Date | null
  /* Set only on guests. A TTL index removes an unclaimed guest, and its tasks
     go with it, so abandoned anonymous data does not accumulate forever. */
  guestExpiresAt: Date | null
}

export interface SessionDoc extends Document {
  /** SHA-256 of the cookie value. The token itself is never stored, so a
      database leak yields nothing usable (PLAN.md 4.8). */
  tokenHash: string
  userId: ObjectId
  createdAt: Date
  expiresAt: Date
}

export const USERS = 'users'
export const SESSIONS = 'sessions'

export async function users(): Promise<Collection<UserDoc>> {
  return (await getDb()).collection<UserDoc>(USERS)
}

export async function sessions(): Promise<Collection<SessionDoc>> {
  return (await getDb()).collection<SessionDoc>(SESSIONS)
}

/** The boundary map: a driver document never travels further than this. */
export function toUser(doc: UserDoc & { _id: ObjectId }): User {
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    isGuest: doc.email === null,
    createdAt: doc.createdAt.toISOString(),
  }
}

let indexesReady: Promise<void> | null = null

export function ensureAuthIndexes(): Promise<void> {
  indexesReady ??= (async () => {
    const [u, s] = [await users(), await sessions()]
    await u.createIndexes([
      /* Unique at the database level, not just checked before insert: two
         concurrent sign-ups for the same address would otherwise both pass.
         Partial, because guests have a null email and a plain unique index
         would let only one of them exist. */
      {
        key: { email: 1 },
        name: 'email_unique',
        unique: true,
        partialFilterExpression: { email: { $type: 'string' } },
      },
      // Unclaimed guests expire; Mongo does the sweeping.
      { key: { guestExpiresAt: 1 }, name: 'guest_ttl', expireAfterSeconds: 0 },
    ])
    await s.createIndexes([
      { key: { tokenHash: 1 }, name: 'tokenHash_unique', unique: true },
      { key: { userId: 1 }, name: 'userId' },
      // Mongo expires sessions itself, so there is no sweeper to forget about.
      { key: { expiresAt: 1 }, name: 'ttl', expireAfterSeconds: 0 },
    ])
  })().catch((error: unknown) => {
    indexesReady = null
    throw error
  })
  return indexesReady
}
