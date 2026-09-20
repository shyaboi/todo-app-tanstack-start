import '@tanstack/react-start/server-only'
import { ObjectId } from 'mongodb'
import { AppError, toSafeError } from '~/server/errors'
import { logger } from '~/server/logger'
import {
  hashPassword,
  verifyPassword,
  wastePasswordWork,
} from './auth.password'
import { ensureAuthIndexes, sessions, toUser, users } from './auth.repo'
import type { UserDoc } from './auth.repo'
import {
  SESSION_TTL_MS,
  clearSessionCookie,
  hashToken,
  newSessionToken,
  readSessionCookie,
  writeSessionCookie,
} from './auth.session'
import type { User, Viewer } from './auth.types'

/* Five failures, then fifteen minutes. The counter lives on the account rather
   than on the IP: it is the account being protected, and an IP is both shared
   by innocent users and trivially rotated by an attacker. */
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000

/** An unclaimed guest, and everything it owns, is removed after this long. */
const GUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** One message for every failure, so the form is not an account directory. */
const CREDENTIALS_REJECTED = 'That email and password do not match an account.'

/**
 * The floor every rejected sign-in is held to, in milliseconds.
 *
 * One message is not enough on its own, because the two paths did different
 * amounts of work. A wrong password on a REAL account costs a scrypt verify
 * plus a write to bump the attempt counter; an unknown address costs a scrypt
 * verify and no write. Measured in the audit: 315ms against a registered
 * address, 213ms against an unregistered one, consistently, on every single
 * attempt. `wastePasswordWork` equalised the hashing and the database round
 * trip gave the answer away anyway.
 *
 * Padding to a fixed floor removes the difference by construction rather than
 * by trying to match one code path's cost to another's. It is set above both
 * measured times so neither path has to be slowed by much to reach it.
 *
 * Honest about the residual: a database slow enough to push the real path past
 * the floor would leak again. The floor narrows the signal to the tail rather
 * than removing it, and a constant-time guarantee is not available while one
 * path talks to a network and the other does not.
 */
const REJECT_FLOOR_MS = 400

/** Holds a rejection until the floor, so the two paths cannot be told apart. */
async function padTo(started: number): Promise<void> {
  const remaining = REJECT_FLOOR_MS - (Date.now() - started)
  if (remaining > 0) await new Promise((r) => setTimeout(r, remaining))
}

async function run<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now()
  try {
    return await fn()
  } catch (error) {
    const safe = toSafeError(error)
    logger.error('auth operation failed', {
      operation,
      errorId: safe.errorId,
      errorClass: error instanceof Error ? error.name : typeof error,
      durationMs: Date.now() - started,
      // Note what is absent: no email, no password, no token. An auth log is
      // exactly where a credential must never be written.
    })
    throw safe
  }
}

/**
 * Deletes every session row for a user, so no previously issued token works.
 *
 * Issuing a fresh token is only half of the defence against session fixation,
 * and for a long time this code had only that half. The old token stayed in
 * `sessions` with a valid expiry, so a guest token captured BEFORE sign-up
 * still resolved to the same user id afterwards -- and that row is now a
 * claimed account. Demonstrated in the audit: the pre-authentication cookie,
 * replayed in a clean browser, read the finished account's tasks.
 *
 * Called on the privilege transition only. Signing in to an account that
 * already exists deliberately leaves other sessions alone: those are the
 * owner's other devices, and signing in on a laptop should not sign out a
 * phone.
 */
async function revokeSessionsFor(userId: ObjectId): Promise<void> {
  await (await sessions()).deleteMany({ userId })
}

/**
 * Issues a fresh session and sets the cookie.
 *
 * Always a new token, never a reused one: a token that existed before
 * authentication must not survive it, which is what session fixation exploits.
 * Revoking the old rows is the other half -- see `revokeSessionsFor`.
 */
async function startSession(userId: ObjectId): Promise<void> {
  const token = newSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  const col = await sessions()
  await col.insertOne({
    tokenHash: hashToken(token),
    userId,
    createdAt: new Date(),
    expiresAt,
  })

  writeSessionCookie(token, expiresAt)
}

/**
 * Resolves the session cookie to an identity, or null. Read-only.
 *
 * The only way anything learns who the caller is. No server function accepts a
 * user id as an argument, so a client cannot claim to be someone else.
 */
export async function currentViewer(): Promise<Viewer | null> {
  const token = readSessionCookie()
  if (!token) return null

  const col = await sessions()
  const session = await col.findOne({ tokenHash: hashToken(token) })

  // TTL cleanup is periodic rather than instant, so expiry is checked here too.
  if (!session || session.expiresAt <= new Date()) return null

  const user = await (await users()).findOne({ _id: session.userId })
  if (!user) return null

  // Sliding expiry, rewritten at most hourly so an active session does not
  // cause a database write on every single request.
  const refreshed = new Date(Date.now() + SESSION_TTL_MS)
  if (refreshed.getTime() - session.expiresAt.getTime() > 60 * 60 * 1000) {
    await col.updateOne(
      { _id: session._id },
      { $set: { expiresAt: refreshed } },
    )
    writeSessionCookie(token, refreshed)
  }

  return {
    userId: session.userId.toHexString(),
    email: user.email,
    isGuest: user.email === null,
  }
}

/**
 * Resolves the caller, creating a guest account if there is no session.
 *
 * This is what lets the app be used before signing up. A guest is a real row
 * with a real id, so tasks have a genuine owner and every permission check
 * behaves exactly as it does for a claimed account -- there is no second,
 * weaker path for anonymous data. Signing up later claims this same row
 * (PLAN.md 4.8).
 */
export function ensureViewer(): Promise<Viewer> {
  return run('ensureViewer', async () => {
    const existing = await currentViewer()
    if (existing) return existing

    await ensureAuthIndexes()
    const now = new Date()
    const guest: UserDoc = {
      email: null,
      passwordHash: null,
      createdAt: now,
      updatedAt: now,
      failedAttempts: 0,
      lockedUntil: null,
      guestExpiresAt: new Date(Date.now() + GUEST_TTL_MS),
    }

    const { insertedId } = await (await users()).insertOne(guest)
    await startSession(insertedId)

    return { userId: insertedId.toHexString(), email: null, isGuest: true }
  })
}

/** For anything that must not proceed without a claimed account. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await currentViewer()
  if (!viewer) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.')
  return viewer
}

/**
 * Creates an account, or claims the guest one the caller is already using.
 *
 * Claiming is the point: the row keeps its id, so every task created
 * anonymously still points at it and nothing moves. The alternative -- insert a
 * new row, then bulk re-own the tasks -- can half-fail, and a half-migrated
 * account is worse than no account.
 */
export function signUp(email: string, password: string): Promise<User> {
  return run('signUp', async () => {
    await ensureAuthIndexes()
    const col = await users()
    const now = new Date()
    const passwordHash = await hashPassword(password)
    const viewer = await currentViewer()

    try {
      if (viewer?.isGuest) {
        const claimed = await col.findOneAndUpdate(
          // Guarded on email still being null, so two concurrent claims of the
          // same guest cannot both succeed.
          { _id: new ObjectId(viewer.userId), email: null },
          {
            $set: { email, passwordHash, updatedAt: now },
            // Clearing this takes the row out of the guest TTL sweep.
            $unset: { guestExpiresAt: '' },
          },
          { returnDocument: 'after' },
        )
        if (claimed) {
          /* Every token issued to this row while it was a guest is destroyed
             before a new one is issued. Order matters: revoking after
             `startSession` would delete the token just written. */
          await revokeSessionsFor(claimed._id)
          await startSession(claimed._id)
          return toUser(claimed)
        }
        // The guest was claimed or expired underneath us; fall through.
      }

      const doc: UserDoc = {
        email,
        passwordHash,
        createdAt: now,
        updatedAt: now,
        failedAttempts: 0,
        lockedUntil: null,
        guestExpiresAt: null,
      }
      const { insertedId } = await col.insertOne(doc)
      await startSession(insertedId)
      return toUser({ ...doc, _id: insertedId })
    } catch (error) {
      // The unique index decides this, not a prior findOne that two concurrent
      // requests could both pass.
      if (isDuplicateKey(error)) {
        throw new AppError(
          'CONFLICT',
          'An account with that email already exists.',
        )
      }
      throw error
    }
  })
}

export function signIn(email: string, password: string): Promise<User> {
  return run('signIn', async () => {
    const started = Date.now()
    await ensureAuthIndexes()
    const col = await users()
    const doc = await col.findOne({ email })

    if (!doc || !doc.passwordHash) {
      /* Hash something anyway. Returning early would answer an unknown address
         in about a millisecond and a known one in about a hundred, which makes
         the form a membership oracle. */
      await wastePasswordWork(password)
      await padTo(started)
      throw new AppError('VALIDATION_FAILED', CREDENTIALS_REJECTED)
    }

    if (doc.lockedUntil && doc.lockedUntil > new Date()) {
      /* The SAME message as every other failure, and the same delay.
         "Too many attempts" is only ever true of an address that has an
         account, so saying it turned the form back into the directory the
         rest of this function works to avoid: six wrong guesses and the
         wording told you whether anyone had registered.

         The cost is real and accepted: someone who has genuinely locked
         themselves out is not told why. The fix for that is a reset-by-email
         flow, which needs a mail service this build does not have (PLAN.md
         9.3) -- not a message that answers the question for everyone. */
      await wastePasswordWork(password)
      await padTo(started)
      throw new AppError('VALIDATION_FAILED', CREDENTIALS_REJECTED)
    }

    if (!(await verifyPassword(password, doc.passwordHash))) {
      const attempts = doc.failedAttempts + 1
      await col.updateOne(
        { _id: doc._id },
        {
          $set: {
            failedAttempts: attempts,
            lockedUntil:
              attempts >= MAX_ATTEMPTS
                ? new Date(Date.now() + LOCKOUT_MS)
                : null,
            updatedAt: new Date(),
          },
        },
      )
      await padTo(started)
      throw new AppError('VALIDATION_FAILED', CREDENTIALS_REJECTED)
    }

    if (doc.failedAttempts !== 0 || doc.lockedUntil) {
      await col.updateOne(
        { _id: doc._id },
        {
          $set: { failedAttempts: 0, lockedUntil: null, updatedAt: new Date() },
        },
      )
    }

    /* Anything created as a guest moves to the account being signed into, so
       work done before signing in is not silently abandoned. Here the tasks are
       adopted rather than the row claimed, because the target account already
       exists and has a history of its own. */
    const guestId = await guestIdToAdopt()
    await startSession(doc._id)
    if (guestId) await adoptGuestTasks(guestId, doc._id)

    return toUser(doc)
  })
}

/** The current session's user id, but only when it is an unclaimed guest. */
async function guestIdToAdopt(): Promise<ObjectId | null> {
  const viewer = await currentViewer()
  if (!viewer?.isGuest) return null
  return new ObjectId(viewer.userId)
}

/* Imported lazily to keep a cycle from forming: the task layer reads the
   viewer, and this reassigns tasks. */
async function adoptGuestTasks(from: ObjectId, to: ObjectId): Promise<void> {
  const { reassignOwner } = await import('~/features/tasks/task.repo')
  const { reassignListOwner } = await import('~/features/lists/list.repo')
  const movedTasks = await reassignOwner(from, to)
  // A guest's lists come along with the tasks that point at them.
  await reassignListOwner(from, to)

  // The guest row has served its purpose. Guarded on email being null so this
  // can never delete a claimed account.
  await (await users()).deleteOne({ _id: from, email: null })
  /* And its tokens with it. They were already inert -- `currentViewer` returns
     null when the user row is gone -- but leaving rows behind that nothing
     will ever delete before their TTL is how a collection grows without
     anyone deciding that it should. */
  await revokeSessionsFor(from)

  logger.info('adopted guest tasks on sign-in', {
    operation: 'signIn',
    entityId: to.toHexString(),
    movedTasks,
  })
}

export function signOut(): Promise<void> {
  return run('signOut', async () => {
    const token = readSessionCookie()
    // The row goes first: clearing only the cookie would leave a session that
    // still works for anyone who copied the value.
    if (token) {
      await (await sessions()).deleteOne({ tokenHash: hashToken(token) })
    }
    clearSessionCookie()
  })
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  )
}
