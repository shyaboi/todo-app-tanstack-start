import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './auth.password'

/* These run in the `server` vitest project (node), not jsdom: this is server
   code and testing it in a browser-shaped environment would hide exactly the
   sort of mistake the environment split exists to catch. */

describe('hashPassword', () => {
  it('never stores the password itself', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(stored).not.toContain('correct horse battery staple')
    expect(stored.toLowerCase()).not.toContain('horse')
  })

  it('records its own cost parameters, so they can be raised later', async () => {
    const stored = await hashPassword('a password worth keeping')
    const [algo, N, r, p, salt, hash] = stored.split('$')
    expect(algo).toBe('scrypt')
    expect(Number(N)).toBeGreaterThanOrEqual(32768)
    expect(Number(r)).toBe(8)
    expect(Number(p)).toBe(1)
    expect(salt).toBeTruthy()
    expect(hash).toBeTruthy()
  })

  it('salts per password, so identical passwords hash differently', async () => {
    const [a, b] = await Promise.all([
      hashPassword('the same password'),
      hashPassword('the same password'),
    ])
    // Without a per-password salt these would be identical, and one cracked
    // hash would crack every account sharing that password.
    expect(a).not.toBe(b)
    expect(await verifyPassword('the same password', a)).toBe(true)
    expect(await verifyPassword('the same password', b)).toBe(true)
  })
})

describe('verifyPassword', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('hunter2-but-longer')
    expect(await verifyPassword('hunter2-but-longer', stored)).toBe(true)
    expect(await verifyPassword('hunter2-but-longe', stored)).toBe(false)
    expect(await verifyPassword('Hunter2-but-longer', stored)).toBe(false)
    expect(await verifyPassword('', stored)).toBe(false)
  })

  it('normalises unicode, so the same typed password always matches', async () => {
    // U+00E9 vs e + U+0301 look identical and some keyboards produce each.
    const composed = 'café password 1'
    const decomposed = 'café password 1'
    expect(composed).not.toBe(decomposed)
    expect(await verifyPassword(decomposed, await hashPassword(composed))).toBe(
      true,
    )
  })

  it('returns false rather than throwing on a malformed stored value', async () => {
    // A corrupt row must be indistinguishable from a wrong password, and must
    // never take the sign-in path down with it.
    for (const bad of [
      '',
      'not-a-hash',
      'scrypt$only$four$parts',
      'bcrypt$32768$8$1$c2FsdA$aGFzaA',
      'scrypt$notanumber$8$1$c2FsdA$aGFzaA',
      'scrypt$32768$8$1$$',
    ]) {
      expect(await verifyPassword('anything', bad), bad).toBe(false)
    }
  })

  it('does not crash on absurd parameters in a tampered row', async () => {
    // Would otherwise try to allocate far past maxmem and throw.
    const tampered = 'scrypt$1073741824$8$1$c2FsdA$aGFzaA'
    expect(await verifyPassword('anything', tampered)).toBe(false)
  })
})
