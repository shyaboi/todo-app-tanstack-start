import '@tanstack/react-start/server-only'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { ScryptOptions } from 'node:crypto'

// promisify drops the overload that accepts options, so the cost parameters
// would be silently ignored. Wrapped by hand to keep them typed.
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error)
      else resolve(derived)
    })
  })
}

/* Password hashing on node:crypto's scrypt. argon2id is the stronger choice
   but needs a native module; scrypt is memory-hard, in the standard library,
   and far above bcrypt-with-bad-params (PLAN.md 4.8).

   N=2^15 costs about 33 MB and ~100ms per hash. Node's default maxmem is
   32 MB, which this exceeds, so maxmem is passed explicitly -- without it
   scrypt throws rather than silently weakening. */
const PARAMS = {
  N: 32768,
  r: 8,
  p: 1,
  keylen: 32,
  maxmem: 64 * 1024 * 1024,
} as const

const SALT_BYTES = 16

/**
 * Hashes a password into a self-describing string:
 * `scrypt$N$r$p$salt$hash`, both parts base64url.
 *
 * The parameters travel with the hash so they can be raised later without
 * invalidating anyone's existing password: verification reads the cost the
 * hash was made with, not today's constant.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const derived = await scryptAsync(
    password.normalize('NFKC'),
    salt,
    PARAMS.keylen,
    {
      N: PARAMS.N,
      r: PARAMS.r,
      p: PARAMS.p,
      maxmem: PARAMS.maxmem,
    },
  )

  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$')
}

/**
 * Constant-time verification.
 *
 * Returns false for a malformed stored value rather than throwing, so a
 * corrupt row cannot be told apart from a wrong password.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts
  const N = Number(nRaw)
  const r = Number(rRaw)
  const p = Number(pRaw)
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p))
    return false

  let expected: Buffer
  let salt: Buffer
  try {
    salt = Buffer.from(saltRaw!, 'base64url')
    expected = Buffer.from(hashRaw!, 'base64url')
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false

  let derived: Buffer
  try {
    derived = await scryptAsync(
      password.normalize('NFKC'),
      salt,
      expected.length,
      {
        N,
        r,
        p,
        maxmem: PARAMS.maxmem,
      },
    )
  } catch {
    // Absurd parameters in a tampered row must not crash the sign-in path.
    return false
  }

  // Byte-by-byte `===` leaks the hash through response timing.
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

/**
 * Work done on the unknown-user path, so "no such account" and "wrong
 * password" take comparable time. Without this, sign-in timing is an account
 * enumeration oracle (PLAN.md 4.8).
 */
const DUMMY_HASH_PROMISE = hashPassword('password-that-is-never-anyones')

export async function wastePasswordWork(password: string): Promise<void> {
  await verifyPassword(password, await DUMMY_HASH_PROMISE)
}
