import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ObjectId } from 'mongodb'

/* The load-bearing suite. It runs against a real MongoDB and calls the SERVICE
   layer directly -- no HTTP, no cookies, no React. That is deliberate: the
   permission boundary is the query filter, so a guard that only works in the
   browser, or a list that is merely filtered after fetching, cannot make these
   pass (PLAN.md 4.8).

   Every assertion here is an attack: A holds a valid session and knows one of
   B's task ids. */

process.env.MONGODB_DB = process.env.MONGODB_DB ?? 'tasker_integration'

const service = await import('./task.service')
const { tasks, trash } = await import('./task.repo')
const { closeClient, getDb } = await import('~/server/db')

/** Two unrelated owners. Ids only -- the service never sees a session here. */
const ada = new ObjectId().toHexString()
const grace = new ObjectId().toHexString()

const draft = (title: string) => ({
  title,
  notes: null,
  status: 'todo' as const,
  dueAt: null,
  priority: 'p2' as const,
  listId: null,
})

let adaTaskId: string
let graceTaskId: string

/* Scoped to this file's own owners, never the whole collection. Integration
   files share one database and vitest may run them together, so a suite that
   wipes `tasks` wholesale deletes another suite's fixtures out from under it
   -- which is exactly what happened when the lists suite arrived. */
const owners = { ownerId: { $in: [new ObjectId(ada), new ObjectId(grace)] } }
const trashOwners = {
  'task.ownerId': { $in: [new ObjectId(ada), new ObjectId(grace)] },
}

async function clearOurs() {
  const db = await getDb()
  await Promise.all([
    db.collection('tasks').deleteMany(owners),
    db.collection('tasks_trash').deleteMany(trashOwners),
  ])
}

beforeAll(async () => {
  await clearOurs()
  adaTaskId = (await service.createTask(ada, draft("Ada's task"))).id
  graceTaskId = (await service.createTask(grace, draft("Grace's task"))).id
})

afterAll(async () => {
  await clearOurs()
  await closeClient()
})

describe('listTasks', () => {
  it('returns only the caller’s own tasks', async () => {
    const adaSees = await service.listTasks(ada)
    const graceSees = await service.listTasks(grace)

    expect(adaSees.map((t) => t.title)).toEqual(["Ada's task"])
    expect(graceSees.map((t) => t.title)).toEqual(["Grace's task"])
  })

  it('does not leak another owner’s task through a search term that matches it', async () => {
    // The obvious mistake: scoping the list query but not the filtered one.
    const results = await service.listTasks(ada, { q: 'Grace' })
    expect(results).toEqual([])
  })

  it('does not leak through a status filter either', async () => {
    const results = await service.listTasks(ada, { status: ['todo'] })
    expect(results.map((t) => t.title)).toEqual(["Ada's task"])
  })

  it('never exposes ownerId to the caller', async () => {
    const [task] = await service.listTasks(ada)
    // The DTO deliberately omits it: a field the client never receives cannot
    // be sent back (PLAN.md 4.8).
    expect(task).not.toHaveProperty('ownerId')
  })
})

describe('getTask', () => {
  it('refuses another owner’s task by id', async () => {
    await expect(service.getTask(ada, graceTaskId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('reports a foreign task and a missing task identically', async () => {
    const missing = new ObjectId().toHexString()

    const foreign = await service
      .getTask(ada, graceTaskId)
      .catch((e: unknown) => e)
    const absent = await service.getTask(ada, missing).catch((e: unknown) => e)

    /* NOT_FOUND for both, with the same message. FORBIDDEN would confirm the
       task exists and tell an attacker their id guess landed. */
    expect((foreign as { code: string }).code).toBe('NOT_FOUND')
    expect((absent as { code: string }).code).toBe('NOT_FOUND')
    expect((foreign as { message: string }).message).toBe(
      (absent as { message: string }).message,
    )
  })
})

describe('updateTask', () => {
  it('refuses to change another owner’s task', async () => {
    await expect(
      service.updateTask(ada, graceTaskId, { title: 'defaced' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('leaves the target untouched after a refused attempt', async () => {
    await service
      .updateTask(ada, graceTaskId, { status: 'done' })
      .catch(() => null)

    // Read as the real owner: the refusal must be a genuine no-op, not a write
    // that merely failed to return the document.
    const [graceTask] = await service.listTasks(grace)
    expect(graceTask?.title).toBe("Grace's task")
    expect(graceTask?.status).toBe('todo')
  })

  it('cannot be tricked by an ownerId smuggled into the patch', async () => {
    /* The patch type already forbids ownerId, so this is cast in deliberately:
       the type system is not the thing under test here. What matters is that a
       hand-crafted request carrying the field changes nothing, because the
       update builds $set field by field from the parsed patch and never
       spreads a request body. */
    const smuggled = {
      ownerId: grace,
      title: 'moved?',
    } as unknown as Parameters<typeof service.updateTask>[2]
    await service.updateTask(ada, adaTaskId, smuggled)

    // Still Ada's: the update builds $set field by field from the parsed patch
    // and never spreads a request body.
    expect((await service.listTasks(grace)).map((t) => t.title)).toEqual([
      "Grace's task",
    ])
    const stillAdas = await tasks().then((c) =>
      c.findOne({ _id: new ObjectId(adaTaskId) }),
    )
    expect(stillAdas?.ownerId.toHexString()).toBe(ada)
  })
})

describe('deleteTask', () => {
  it('refuses another owner’s task, and does not delete it', async () => {
    await expect(service.deleteTask(ada, graceTaskId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await service.listTasks(grace)).toHaveLength(1)
  })
})

describe('restoreTask', () => {
  it('will not restore another owner’s task, even with a valid undo token', async () => {
    // Grace deletes her own task and gets a real, unguessable token.
    const { undoToken } = await service.deleteTask(grace, graceTaskId)

    /* Ada holds the token. An unguessable token is not an authorisation model:
       one that leaks must not restore a task into the wrong list. */
    await expect(service.restoreTask(ada, undoToken)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })

    // Still recoverable by its actual owner -- the refusal consumed nothing.
    const restored = await service.restoreTask(grace, undoToken)
    expect(restored.title).toBe("Grace's task")
    expect(
      await trash().then((c) => c.countDocuments({ token: undoToken })),
    ).toBe(0)
  })
})
