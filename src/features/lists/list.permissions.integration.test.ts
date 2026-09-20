import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ObjectId } from 'mongodb'

/* The load-bearing suite for lists, the same shape as the one for tasks:
   a real MongoDB, the service layer directly, and every assertion an attack.
   A holds a valid session and knows one of B's list ids (PLAN.md 4.8, 7.4). */

process.env.MONGODB_DB = process.env.MONGODB_DB ?? 'tasker_integration'

const lists = await import('./list.service')
const tasks = await import('~/features/tasks/task.service')
const { closeClient, getDb } = await import('~/server/db')

const ada = new ObjectId().toHexString()
const grace = new ObjectId().toHexString()

const draft = (title: string, listId: string | null = null) => ({
  title,
  notes: null,
  status: 'todo' as const,
  dueAt: null,
  priority: 'p2' as const,
  listId,
})

let adaListId: string
let graceListId: string

/* Scoped to this file's own owners, never the whole collection: integration
   files share one database and vitest may run them together, so wiping
   `tasks` wholesale would delete the task suite's fixtures mid-run. It did. */
async function reset() {
  const db = await getDb()
  const owners = { ownerId: { $in: [new ObjectId(ada), new ObjectId(grace)] } }
  await Promise.all([
    db.collection('lists').deleteMany(owners),
    db.collection('tasks').deleteMany(owners),
    db.collection('tasks_trash').deleteMany({
      'task.ownerId': { $in: [new ObjectId(ada), new ObjectId(grace)] },
    }),
  ])
}

beforeAll(async () => {
  await reset()
  adaListId = (await lists.createList(ada, { name: 'Docs' })).id
  graceListId = (await lists.createList(grace, { name: 'Private' })).id
})

afterAll(async () => {
  await reset()
  await closeClient()
})

describe('listLists', () => {
  it('returns only the caller’s own lists', async () => {
    expect((await lists.listLists(ada)).map((l) => l.name)).toEqual(['Docs'])
    expect((await lists.listLists(grace)).map((l) => l.name)).toEqual([
      'Private',
    ])
  })
})

describe('another owner’s list id', () => {
  it('cannot be renamed, and the failure is NOT_FOUND', async () => {
    await expect(
      lists.renameList(ada, graceListId, 'Mine now'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await lists.listLists(grace))[0]?.name).toBe('Private')
  })

  it('cannot be deleted', async () => {
    await expect(lists.deleteList(ada, graceListId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await lists.listLists(grace)).toHaveLength(1)
  })

  it('cannot be assigned to a task on create or on update', async () => {
    await expect(
      tasks.createTask(ada, draft('Sneaky', graceListId)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const mine = await tasks.createTask(ada, draft('Mine'))
    await expect(
      tasks.updateTask(ada, mine.id, { listId: graceListId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await tasks.getTask(ada, mine.id)).listId).toBeNull()
  })

  it('a task in one’s own list is fine, of course', async () => {
    const t = await tasks.createTask(ada, draft('Filed', adaListId))
    expect(t.listId).toBe(adaListId)
  })
})

describe('names', () => {
  it('are unique per owner, case-insensitively, and the message says so', async () => {
    /* Asserted field by field rather than with expect.stringContaining,
       which is typed `any` and would spread that through the matcher. */
    await expect(
      lists.createList(ada, { name: '  docs ' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await lists.createList(ada, { name: '  docs ' }).catch((e: unknown) => {
      // The message names the list that already exists, so the person can
      // find it rather than guess.
      expect((e as { message: string }).message).toContain('“Docs”')
    })
    // But Grace may have her own "Docs": uniqueness is per owner.
    const hers = await lists.createList(grace, { name: 'Docs' })
    expect(hers.name).toBe('Docs')
  })
})

describe('deleteList', () => {
  it('unassigns the list’s tasks and never deletes them', async () => {
    const list = await lists.createList(ada, { name: 'Temporary' })
    const a = await tasks.createTask(ada, draft('Stays 1', list.id))
    const b = await tasks.createTask(ada, draft('Stays 2', list.id))
    const elsewhere = await tasks.createTask(ada, draft('Elsewhere', adaListId))

    const result = await lists.deleteList(ada, list.id)
    expect(result.unassigned).toBe(2)

    const after = await tasks.listTasks(ada)
    const byId = new Map(after.map((t) => [t.id, t]))
    expect(byId.get(a.id)?.listId).toBeNull()
    expect(byId.get(b.id)?.listId).toBeNull()
    expect(byId.get(elsewhere.id)?.listId).toBe(adaListId)
    expect(after.length).toBeGreaterThanOrEqual(3)
  })
})
