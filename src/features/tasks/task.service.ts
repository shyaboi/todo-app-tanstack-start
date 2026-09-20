import '@tanstack/react-start/server-only'
import { ObjectId } from 'mongodb'
import { AppError } from '~/server/errors'
import { run } from '~/server/operation'
import { assertListOwned } from '~/features/lists/list.service'
import { randomUUID } from 'node:crypto'
import { ObjectId as ObjectIdCtor } from 'mongodb'
import { tasks, trash, toTask, ensureIndexes } from './task.repo'
import type { Sort } from 'mongodb'
import type { TaskDoc } from './task.repo'
import type { Task } from './task.types'
import type { CreateTaskParsed } from './task.schema'
import type { z } from 'zod'
import type { listTasksInput, taskPatch } from './task.schema'

/* Domain operations. Validation has already happened at the server-function
   boundary, so everything arriving here is parsed and trusted; everything
   leaving is a mapped DTO. Driver errors are converted before they escape.

   PERMISSIONS LIVE HERE. Every function takes an ownerId and puts it in the
   query FILTER, so a task belonging to someone else does not match and is
   indistinguishable from one that never existed. Enforcing this in a route
   guard or by filtering after the fetch would not be enforcement at all:
   updateTask takes an id, and an id is guessable (PLAN.md 4.8).

   A wrong owner therefore yields NOT_FOUND rather than FORBIDDEN. FORBIDDEN
   would confirm the task exists, which tells an attacker their guess landed. */

type ListFilters = z.output<typeof listTasksInput>
type Patch = z.output<typeof taskPatch>

/* A user's search text is escaped before it becomes a regex, and is only ever
   used as a VALUE. No part of a filter document is built from user input, so
   there is no shape a request can take that becomes a Mongo operator
   (system design 15). */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function listTasks(
  ownerId: string,
  filters: ListFilters = {},
): Promise<Task[]> {
  return run('listTasks', undefined, async () => {
    await ensureIndexes()
    const col = await tasks()

    // Owner first: this is a filter, not a post-fetch sieve.
    const query: Record<string, unknown> = {
      ownerId: new ObjectIdCtor(ownerId),
    }

    if (filters.status?.length) query.status = { $in: filters.status }
    if (filters.listId) query.listId = filters.listId

    if (filters.q) {
      const rx = new RegExp(escapeRegex(filters.q), 'i')
      query.$or = [{ title: rx }, { notes: rx }]
    }

    const due = dueRange(filters.due)
    if (due) query.dueAt = due

    // Typed as Sort rather than inferred: the two branches have different
    // keys, and a union of object literals is not assignable to Sort.
    const sort: Sort =
      filters.sort === 'due' ? { dueAt: 1, createdAt: -1 } : { createdAt: -1 }

    const docs = await col.find(query).sort(sort).limit(500).toArray()
    return docs.map(toTask)
  })
}

function dueRange(due: ListFilters['due']): Record<string, unknown> | null {
  if (!due || due === 'any') return null
  if (due === 'none') return { $eq: null }

  const now = new Date()
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  if (due === 'overdue') return { $ne: null, $lt: now }
  if (due === 'today') return { $ne: null, $lte: endOfToday }

  const endOfWeek = new Date(endOfToday)
  endOfWeek.setDate(endOfWeek.getDate() + 7)
  return { $ne: null, $lte: endOfWeek }
}

export function createTask(
  ownerId: string,
  input: CreateTaskParsed,
): Promise<Task> {
  return run('createTask', undefined, async () => {
    // A list is a reference to something owned. Someone else's list id is
    // refused before anything is written, as NOT_FOUND (PLAN.md 4.8).
    if (input.listId) await assertListOwned(ownerId, input.listId)
    const col = await tasks()
    // Timestamps and id are generated here. The client supplies neither, and
    // the schema rejects the attempt (system design 5).
    const now = new Date()
    const doc: TaskDoc = {
      // From the session, never from the request body.
      ownerId: new ObjectIdCtor(ownerId),
      title: input.title,
      notes: input.notes,
      status: input.status,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      priority: input.priority,
      listId: input.listId ? new ObjectIdCtor(input.listId) : null,
      createdAt: now,
      updatedAt: now,
    }
    const result = await col.insertOne(doc)
    return toTask({ ...doc, _id: result.insertedId })
  })
}

export function updateTask(
  ownerId: string,
  id: string,
  patch: Patch,
): Promise<Task> {
  return run('updateTask', id, async () => {
    if (patch.listId) await assertListOwned(ownerId, patch.listId)
    const col = await tasks()

    // Built field by field from the parsed patch -- never spread from a
    // request body, which is how an operator would get in.
    const $set: Partial<TaskDoc> = { updatedAt: new Date() }
    if (patch.title !== undefined) $set.title = patch.title
    if (patch.notes !== undefined) $set.notes = patch.notes
    if (patch.status !== undefined) $set.status = patch.status
    if (patch.priority !== undefined) $set.priority = patch.priority
    if (patch.listId !== undefined)
      $set.listId = patch.listId ? new ObjectIdCtor(patch.listId) : null
    if (patch.dueAt !== undefined)
      $set.dueAt = patch.dueAt ? new Date(patch.dueAt) : null

    const doc = await col.findOneAndUpdate(
      { _id: new ObjectId(id), ownerId: new ObjectIdCtor(ownerId) },
      { $set },
      { returnDocument: 'after' },
    )

    if (!doc) throw new AppError('NOT_FOUND', 'That task no longer exists.')
    return toTask(doc)
  })
}

export function deleteTask(
  ownerId: string,
  id: string,
): Promise<{ id: string; undoToken: string }> {
  return run('deleteTask', id, async () => {
    const col = await tasks()

    /* findOneAndDelete, not deleteOne: the document is needed to park it for
       undo, and doing both in one round trip means there is no window where
       the task is gone but unrecoverable. */
    const doc = await col.findOneAndDelete({
      _id: new ObjectId(id),
      ownerId: new ObjectIdCtor(ownerId),
    })

    // Deleting something already gone is reported, not silently treated as
    // success: the UI needs to know its optimistic removal was wrong.
    if (!doc) throw new AppError('NOT_FOUND', 'That task no longer exists.')

    const undoToken = randomUUID()
    const bin = await trash()
    await bin.insertOne({ token: undoToken, task: doc, deletedAt: new Date() })

    return { id, undoToken }
  })
}

/* The token is the entire authority to restore, and it is unguessable and
   server-issued. The client never sends the task back, so it cannot alter a
   field on the way through -- the restored task is byte-for-byte the one that
   was deleted, including its original id and createdAt. */
export function restoreTask(ownerId: string, undoToken: string): Promise<Task> {
  return run('restoreTask', undefined, async () => {
    const bin = await trash()
    /* Scoped as well. An undo token is unguessable, but "unguessable" is not an
       authorisation model -- one leaked token must not restore a task into
       someone else's list. */
    const entry = await bin.findOneAndDelete({
      token: undoToken,
      'task.ownerId': new ObjectIdCtor(ownerId),
    })

    if (!entry) {
      throw new AppError(
        'NOT_FOUND',
        'That task can no longer be restored. The undo window has passed.',
      )
    }

    const col = await tasks()
    await col.insertOne(entry.task)
    return toTask(entry.task)
  })
}

export function getTask(ownerId: string, id: string): Promise<Task> {
  return run('getTask', id, async () => {
    const col = await tasks()
    const doc = await col.findOne({
      _id: new ObjectId(id),
      ownerId: new ObjectIdCtor(ownerId),
    })
    if (!doc) throw new AppError('NOT_FOUND', 'That task no longer exists.')
    return toTask(doc)
  })
}
