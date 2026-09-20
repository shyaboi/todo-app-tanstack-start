import { describe, it, expect } from 'vitest'
import { describeError } from './describeError'

describe('describeError', () => {
  it('passes a server error payload through: its message was written to be shown', () => {
    const report = describeError({
      code: 'DB_UNAVAILABLE',
      message:
        'Could not reach the database. Your change was rolled back — try again in a moment.',
      errorId: 'k3j4h5g6',
    })
    expect(report).toEqual({
      code: 'DB_UNAVAILABLE',
      message:
        'Could not reach the database. Your change was rolled back — try again in a moment.',
      errorId: 'k3j4h5g6',
      offline: false,
    })
  })

  it('recognises the payload by shape, since the class does not survive the wire', () => {
    const wireShaped = Object.assign(new Error('That task no longer exists.'), {
      code: 'NOT_FOUND',
      errorId: 'zz',
    })
    expect(describeError(wireShaped).code).toBe('NOT_FOUND')
    expect(describeError(wireShaped).errorId).toBe('zz')
  })

  it('a request that never reached the server is offline, and says so', () => {
    const report = describeError(new TypeError('Failed to fetch'))
    expect(report.offline).toBe(true)
    expect(report.message).toMatch(/Could not reach the server/)
    expect(report.errorId).toBeUndefined()
  })

  it('never echoes a message it did not write', () => {
    // A driver message names hosts and internals; none of it may be shown.
    // (No credential-shaped string here on purpose: the pre-commit secret
    // scan is right to refuse one, even in a fixture.)
    const report = describeError(
      new Error(
        'MongoServerSelectionError: getaddrinfo ENOTFOUND cluster0-shard-00-00.example.net',
      ),
    )
    expect(report.message).not.toContain('ENOTFOUND')
    expect(report.message).not.toContain('cluster0')
    expect(report.message).toMatch(/Your change was rolled back/)
    expect(report.offline).toBe(false)
  })

  it('a message without a code is not trusted either', () => {
    expect(describeError({ message: 'anything at all' }).message).not.toBe(
      'anything at all',
    )
    expect(describeError('a string').message).toMatch(/Something failed/)
    expect(describeError(null).message).toMatch(/Something failed/)
  })
})
