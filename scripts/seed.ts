export {}

/* Loads the demo content from the FE design so screenshots match the docs:
   the Ship v1 / Docs / Infra / Polish lists and the ten tasks on the List view.
   `npm run seed` replaces the collection; `npm run seed -- --keep` adds to it. */

try {
  process.loadEnvFile('.env')
} catch {
  // No .env file; fall through to the ambient environment.
}

const { tasks, ensureIndexes } = await import('../src/features/tasks/task.repo')
const { closeClient } = await import('../src/server/db')
const { toSafeError } = await import('../src/server/errors')

const keep = process.argv.includes('--keep')

/** Days from today, so seeded data always straddles overdue/today/this week. */
function due(days: number, hour = 17): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

const now = new Date()
const seed = [
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

try {
  await ensureIndexes()
  const col = await tasks()

  if (!keep) {
    const { deletedCount } = await col.deleteMany({})
    console.warn(`  cleared     ${deletedCount} existing task(s)`)
  }

  const docs = seed.map(([title, listId, status, priority, dueAt]) => ({
    title,
    notes: null,
    status,
    dueAt,
    priority,
    listId,
    createdAt: now,
    updatedAt: now,
  }))

  const { insertedCount } = await col.insertMany(docs)
  console.warn(`  inserted    ${insertedCount} task(s)`)
  console.warn(`  by status   ${summarise(docs.map((d) => d.status))}`)
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
