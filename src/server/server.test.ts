import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { env, resetEnvCache } from './env'
import { AppError, toSafeError } from './errors'
import { logger } from './logger'

const REAL = { ...process.env }
// Fixtures use the reserved 'example' convention so the secret scanners can
// tell a test double from a real credential -- see .gitleaks.toml.
const FAKE_URI =
  'mongodb://example-user:example-secret@cluster0.example.mongodb.net:27017/?authSource=admin'

beforeEach(() => {
  resetEnvCache()
  process.env = { ...REAL }
})
afterEach(() => {
  process.env = { ...REAL }
  resetEnvCache()
})

describe('env', () => {
  it('throws at startup when MONGODB_URI is missing', () => {
    delete process.env.MONGODB_URI
    expect(() => env()).toThrow(/MONGODB_URI is required/)
  })

  it('rejects a connection string that is not a mongodb URI', () => {
    process.env.MONGODB_URI = 'http://example.com'
    expect(() => env()).toThrow(/must be a mongodb/)
  })

  it('never puts the credential itself in the failure message', () => {
    process.env.MONGODB_URI = 'not-a-uri-but-secret-example-secret'
    try {
      env()
      expect.unreachable('env() should have thrown')
    } catch (e) {
      // The message must name the offending KEY, never echo its VALUE --
      // startup errors land in CI logs and terminal scrollback.
      expect((e as Error).message).not.toContain('example-secret')
      expect((e as Error).message).toContain('MONGODB_URI')
    }
  })

  it('defaults the database name and caches the parse', () => {
    process.env.MONGODB_URI = FAKE_URI
    delete process.env.MONGODB_DB
    expect(env().MONGODB_DB).toBe('tasker')
    expect(env()).toBe(env()) // same object: parsed once
  })
})

describe('toSafeError', () => {
  it('discards a driver message wholesale rather than trying to redact it', () => {
    const driverError = new Error(
      `connection refused to ${FAKE_URI} (topology: ReplicaSetNoPrimary)`,
    )
    driverError.name = 'MongoServerSelectionError'

    const safe = toSafeError(driverError)
    const wire = JSON.stringify(safe.toPayload())

    expect(safe.code).toBe('DB_UNAVAILABLE')
    expect(wire).not.toContain('example-secret')
    expect(wire).not.toContain('mongodb.net')
    expect(wire).not.toContain('example-user')
    expect(wire).not.toContain('ReplicaSetNoPrimary')
  })

  it('never serialises a stack or a cause to the client', () => {
    const payload = toSafeError(
      new Error('boom at /srv/app/secret.ts:42'),
    ).toPayload()
    expect(Object.keys(payload).sort()).toEqual(['code', 'errorId', 'message'])
    expect(JSON.stringify(payload)).not.toContain('secret.ts')
  })

  it('passes an intentional AppError through untouched', () => {
    const original = new AppError('NOT_FOUND', 'That task no longer exists.')
    expect(toSafeError(original)).toBe(original)
  })

  it('classifies a duplicate key as a conflict', () => {
    const dup = Object.assign(new Error('E11000 duplicate key'), {
      name: 'MongoServerError',
      code: 11000,
    })
    expect(toSafeError(dup).code).toBe('CONFLICT')
  })

  it('gives every error an id that ties the message to the server log', () => {
    const { errorId, message } = toSafeError(new Error('x')).toPayload()
    expect(errorId).toMatch(/^[a-z0-9]{6,}$/)
    expect(message.length).toBeGreaterThan(0)
  })
})

describe('logger redaction', () => {
  it('redacts by key, since a value scan cannot know uri holds a password', () => {
    const out = logger.redact({
      operation: 'listTodos',
      uri: FAKE_URI,
      password: 'hunter2',
      authorization: 'Bearer abc',
      entityId: '507f1f77bcf86cd799439011',
    }) as Record<string, unknown>

    expect(out.uri).toBe('[redacted]')
    expect(out.password).toBe('[redacted]')
    expect(out.authorization).toBe('[redacted]')
    // Non-secret context must survive, or the logs are useless.
    expect(out.entityId).toBe('507f1f77bcf86cd799439011')
    expect(out.operation).toBe('listTodos')
  })

  it('also catches a credential smuggled in under an innocent key', () => {
    const out = logger.redact({
      operation: 'connect',
      detail: `failed to reach ${FAKE_URI}`,
    }) as Record<string, string>
    expect(out.detail).not.toContain('example-secret')
    expect(out.detail).toContain('[redacted]')
  })

  it('redacts inside nested objects and arrays', () => {
    const out = logger.redact({
      operation: 'x',
      attempts: [{ uri: FAKE_URI }, { note: `tried ${FAKE_URI}` }],
    }) as { attempts: Array<Record<string, string>> }
    expect(JSON.stringify(out)).not.toContain('example-secret')
  })
})
