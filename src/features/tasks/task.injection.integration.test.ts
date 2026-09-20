import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ObjectId } from 'mongodb'

/* Search text reaches a query document (PLAN.md 8.2, system design §15).
   Everything else about that is asserted in unit tests -- `escapeRegex` is
   covered term by term -- but only a real MongoDB can answer the question
   that actually matters: does a hostile search return someone's whole
   collection?

   Against the service, not the server function, because this is about the
   query that is built rather than the schema that guards it. The schema is
   the first lock (a `q` that is not a string never arrives); this is the
   second, and it holds even if the first is ever loosened. */

process.env.MONGODB_DB = process.env.MONGODB_DB ?? 'tasker_integration'

const tasks = await import('./task.service')
const { closeClient, getDb } = await import('~/server/db')

const owner = new ObjectId().toHexString()

const draft = (title: string) => ({
  title,
  notes: null,
  status: 'todo' as const,
  dueAt: null,
  priority: 'p2' as const,
  listId: null,
})

async function reset() {
  const db = await getDb()
  // This file's own owner only: integration files share one database.
  await db.collection('tasks').deleteMany({ ownerId: new ObjectId(owner) })
}

beforeAll(async () => {
  await reset()
  await tasks.createTask(owner, draft('write the deploy notes'))
  await tasks.createTask(owner, draft('rotate the credential'))
  await tasks.createTask(owner, draft('draft the README'))
})

afterAll(async () => {
  await reset()
  await closeClient()
})

describe('a hostile search term is text, not a query', () => {
  it.each([
    ['.*', 'the wildcard that would return everything'],
    ['.+', 'the same, one character on'],
    ['^', 'an anchor that matches every string'],
    ['(?:)', 'an empty group'],
    ['[a-z]', 'a character class'],
    ['{"$ne":null}', 'an operator document, spelled out as text'],
    ['$where', 'the name of the one operator that runs code'],
  ])('%j matches nothing (%s)', async (q) => {
    const found = await tasks.listTasks(owner, { q })
    /* Nothing, not everything. A regex metacharacter that survived escaping
       would return all three, which is how a search box becomes a way to read
       a collection. */
    expect(found).toEqual([])
  })

  it('still finds what a person actually typed', async () => {
    const found = await tasks.listTasks(owner, { q: 'deploy' })
    expect(found.map((t) => t.title)).toEqual(['write the deploy notes'])
  })

  it('treats punctuation in a real title literally', async () => {
    await tasks.createTask(owner, draft('ship v1.0 (finally)'))
    const found = await tasks.listTasks(owner, { q: 'v1.0 (finally)' })
    expect(found.map((t) => t.title)).toEqual(['ship v1.0 (finally)'])
  })
})
