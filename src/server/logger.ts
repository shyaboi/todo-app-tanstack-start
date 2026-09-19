import '@tanstack/react-start/server-only'

/* PLAN.md 17: establish logging boundaries rather than install a telemetry
   stack. Server failures carry operation, error class, duration and entity id;
   credentials, full environment and raw connection strings never appear. */

type Level = 'info' | 'warn' | 'error'

export interface LogContext {
  operation: string
  errorId?: string
  errorClass?: string
  durationMs?: number
  entityId?: string
  [key: string]: unknown
}

/* Redaction is by key, not by value: a value-based scan cannot know that
   `uri` holds a password, and would miss it. */
const REDACTED_KEYS =
  /^(uri|url|password|pass|pwd|token|secret|key|authorization|auth|connectionString|mongodb_uri)$/i

// Catches a credential that reached a log line through some other key name.
const CREDENTIAL_PATTERN =
  /\b(mongodb(\+srv)?|postgres(ql)?|mysql|redis):\/\/[^\s]*@/gi

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]'
  if (typeof value === 'string') {
    return value.replace(
      CREDENTIAL_PATTERN,
      (m) => `${m.split('://')[0]}://[redacted]@`,
    )
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACTED_KEYS.test(k) ? '[redacted]' : redact(v, depth + 1)
    }
    return out
  }
  return value
}

function emit(level: Level, message: string, context: LogContext): void {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(redact(context) as Record<string, unknown>),
  })
  // Only warn/error are allowed by the no-console lint rule; info goes to
  // stdout via warn's channel in dev and is dropped in test.
  if (level === 'error') console.error(line)
  else if (process.env.NODE_ENV !== 'test') console.warn(line)
}

export const logger = {
  info: (message: string, context: LogContext) =>
    emit('info', message, context),
  warn: (message: string, context: LogContext) =>
    emit('warn', message, context),
  error: (message: string, context: LogContext) =>
    emit('error', message, context),
  /** Exposed for tests; the redaction rules are the thing worth asserting. */
  redact,
}
