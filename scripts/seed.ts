import type { ObjectId } from 'mongodb'

/* Loads the demo content from the FE design so screenshots match the docs:
   the Ship v1 / Docs / Infra / Polish lists and the ten tasks on the List view.

   Tasks are owned, so this also creates the accounts that own them. The
   credentials below are seed-only fixtures for a throwaway database -- the E2E
   suite signs in with them, and they are printed on purpose so a reviewer can
   too. They are not secrets and must never be used anywhere real.

     npm run seed            replace the collections
     npm run seed -- --keep  add to what is there
     npm run seed:e2e        the same, against the E2E database
*/

const { loadEnv } = await import('./load-env')
loadEnv()

const { tasks, ensureIndexes } = await import('../src/features/tasks/task.repo')
const { users, sessions, ensureAuthIndexes } =
  await import('../src/features/auth/auth.repo')
const { hashPassword } = await import('../src/features/auth/auth.password')
const { closeClient } = await import('../src/server/db')
const { toSafeError } = await import('../src/server/errors')

const keep = process.argv.includes('--keep')

/** Two accounts, because one cannot demonstrate that owners are separated. */
export const SEED_ACCOUNTS = [
  { email: 'ada@example.com', password: 'seed-password-ada' },
  { email: 'grace@example.com', password: 'seed-password-grace' },
] as const

/** Days from today, so seeded data always straddles overdue/today/this week. */
function due(days: number, hour = 17): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

const now = new Date()

/* Ada gets the ten tasks from the design's List view. Grace gets two of her
   own, so a permissions test has something to try and fail to reach. */
const adaTasks = [
  [
    'Fix focus trap in the delete confirmation dialog',
    'polish',
    'todo',
    'p1',
    due(-1),
  ],
  [
    'Wire optimistic updates into the toggle mutation',
    'ship-v1',
    'doing',
    'p1',
    due(0),
  ],
  [
    'Add fuzzy matching to the command palette',
    'ship-v1',
    'doing',
    'p1',
    due(0),
  ],
  [
    'Add an undo toast for destructive actions',
    'polish',
    'doing',
    'p2',
    due(1),
  ],
  [
    'Draft the README with setup and deploy steps',
    'docs',
    'todo',
    'p2',
    due(2),
  ],
  ['Seed demo data for the hosted demo', 'infra', 'todo', 'p2', due(3)],
  [
    'Write server-function tests for createTodo',
    'ship-v1',
    'todo',
    'p2',
    due(4),
  ],
  [
    'Audit keyboard traversal on the board view',
    'polish',
    'todo',
    'p3',
    due(5),
  ],
  [
    'Persist status filter in the URL search params',
    'ship-v1',
    'done',
    'p2',
    due(-2),
  ],
  ['Set up Vercel preview deploys', 'infra', 'done', 'p3', due(-3)],
] as const

const graceTasks = [
  ["Grace's private note about the release", 'ship-v1', 'todo', 'p1', due(1)],
  ["Grace's second task, also not Ada's", 'docs', 'doing', 'p2', due(2)],
] as const

try {
  await ensureIndexes()
  await ensureAuthIndexes()

  const taskCol = await tasks()
  const userCol = await users()
  const sessionCol = await sessions()

  if (!keep) {
    const [t, u, s] = [
      await taskCol.deleteMany({}),
      await userCol.deleteMany({}),
      await sessionCol.deleteMany({}),
    ]
    console.warn(
      `  cleared     ${t.deletedCount} task(s), ${u.deletedCount} user(s), ${s.deletedCount} session(s)`,
    )
  }

  const ownerIds: Record<string, ObjectId> = {}
  for (const account of SEED_ACCOUNTS) {
    const passwordHash = await hashPassword(account.password)
    const { insertedId } = await userCol.insertOne({
      email: account.email,
      passwordHash,
      createdAt: now,
      updatedAt: now,
      failedAttempts: 0,
      lockedUntil: null,
      guestExpiresAt: null,
    })
    ownerIds[account.email] = insertedId
    console.warn(
      `  account     ${account.email}  (password: ${account.password})`,
    )
  }

  const build = (
    rows: typeof adaTasks | typeof graceTasks,
    ownerId: ObjectId,
  ) =>
    rows.map(([title, listId, status, priority, dueAt]) => ({
      ownerId,
      title,
      notes: null,
      status,
      dueAt,
      priority,
      listId,
      createdAt: now,
      updatedAt: now,
    }))

  const docs = [
    ...build(adaTasks, ownerIds['ada@example.com']!),
    ...build(graceTasks, ownerIds['grace@example.com']!),
  ]

  const { insertedCount } = await taskCol.insertMany(docs)
  console.warn(`  inserted    ${insertedCount} task(s)`)
  console.warn(
    `  ada         ${adaTasks.length}: ${summarise(adaTasks.map((r) => r[2]))}`,
  )
  console.warn(
    `  grace       ${graceTasks.length}: ${summarise(graceTasks.map((r) => r[2]))}`,
  )
} catch (error) {
  const safe = toSafeError(error)
  console.error(`  failed      ${safe.code}: ${safe.message}`)
  process.exitCode = 1
} finally {
  await closeClient()
}

function summarise(values: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].map(([k, n]) => `${k} ${n}`).join(' · ')
}
