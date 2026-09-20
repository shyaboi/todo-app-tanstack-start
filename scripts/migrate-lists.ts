/* Turns the fixed list vocabulary into per-owner list documents (PLAN.md D14).
   Run once per database, before deploying Sprint 7.4.

     npm run migrate:lists -- --dry    say what would change, change nothing
     npm run migrate:lists             do it

   Until 7.4 a task's `listId` was one of four hard-coded strings. Now it is
   an ObjectId pointing at a row in `lists`, which each owner owns. This walks
   every task that still holds a string, creates that owner's list if they do
   not have one by that name, and rewrites the reference.

   Idempotent: a task whose listId is already an ObjectId is left alone, so
   running it twice is the same as running it once. Safe to run while the old
   code is still serving, because it only ever rewrites a field the old code
   reads as an opaque value -- though the window between the two is exactly
   why this exists. */

/* Makes this a module, so top-level await is allowed. The imports below are
   dynamic on purpose: the env has to be loaded before anything reads it. */
export {}

const { loadEnv } = await import('./load-env')
loadEnv()

const { ObjectId } = await import('mongodb')
const { tasks } = await import('../src/features/tasks/task.repo')
const { lists, ensureListIndexes } =
  await import('../src/features/lists/list.repo')
const { normaliseListName } = await import('../src/features/lists/list.types')
const { closeClient, getDb } = await import('../src/server/db')
const { toSafeError } = await import('../src/server/errors')

const dry = process.argv.includes('--dry')

/** The names the four hard-coded ids stood for. */
const LEGACY_NAMES: Record<string, string> = {
  'ship-v1': 'Ship v1',
  docs: 'Docs',
  infra: 'Infra',
  polish: 'Polish',
}

try {
  const db = await getDb()
  console.warn(`  database    ${db.databaseName}${dry ? '  (dry run)' : ''}`)
  await ensureListIndexes()

  const taskCol = await tasks()
  const listCol = await lists()

  /* Only tasks whose listId is still a string. $type is the honest test here:
     a query on the value would have to know every legacy id in advance. */
  const legacy = await taskCol
    .find({ listId: { $type: 'string' } } as never)
    .toArray()

  if (legacy.length === 0) {
    console.warn('  nothing     every task already points at a list document')
  }

  // Cache per owner+name so a thousand tasks make one list, not a thousand.
  const created = new Map<string, InstanceType<typeof ObjectId>>()
  let rewritten = 0
  let unknown = 0

  for (const task of legacy) {
    const legacyId = task.listId as unknown as string
    const name = LEGACY_NAMES[legacyId]
    if (!name) {
      /* A value the old vocabulary never had. Clearing it is the only safe
         call: inventing a list from an unknown id would invent data. */
      unknown += 1
      if (!dry) {
        await taskCol.updateOne(
          { _id: task._id },
          { $set: { listId: null, updatedAt: new Date() } },
        )
      }
      continue
    }

    const cacheKey = `${task.ownerId.toHexString()}:${legacyId}`
    let listId = created.get(cacheKey)

    if (!listId) {
      const key = normaliseListName(name)
      const existing = await listCol.findOne({ ownerId: task.ownerId, key })
      if (existing) {
        listId = existing._id
      } else if (dry) {
        // Nothing to point at yet; count the task and move on.
        created.set(cacheKey, new ObjectId())
        rewritten += 1
        continue
      } else {
        const now = new Date()
        const { insertedId } = await listCol.insertOne({
          ownerId: task.ownerId,
          name,
          key,
          createdAt: now,
          updatedAt: now,
        })
        listId = insertedId
      }
      created.set(cacheKey, listId)
    }

    rewritten += 1
    if (!dry) {
      await taskCol.updateOne(
        { _id: task._id },
        { $set: { listId, updatedAt: new Date() } },
      )
    }
  }

  const owners = new Set(legacy.map((t) => t.ownerId.toHexString())).size
  console.warn(`  tasks       ${legacy.length} still held a string listId`)
  console.warn(`  rewritten   ${rewritten} across ${owners} owner(s)`)
  if (unknown > 0) {
    console.warn(`  cleared     ${unknown} with an id the vocabulary never had`)
  }
  console.warn(`  lists       ${created.size} list document(s) involved`)
  if (dry) console.warn('  dry run     nothing was written')
} catch (error) {
  const safe = toSafeError(error)
  console.error(`  failed      ${safe.code}: ${safe.message}`)
  process.exitCode = 1
} finally {
  await closeClient()
}
