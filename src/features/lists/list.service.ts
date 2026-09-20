import '@tanstack/react-start/server-only'
import { ObjectId } from 'mongodb'
import { AppError } from '~/server/errors'
import { run } from '~/server/operation'
import { tasks } from '~/features/tasks/task.repo'
import { ensureListIndexes, lists, toList } from './list.repo'
import type { ListDoc } from './list.repo'
import type { List } from './list.types'
import { normaliseListName } from './list.types'

/* PERMISSIONS LIVE HERE, exactly as for tasks (PLAN.md 4.8): every query
   carries ownerId in its filter, so another owner's list does not match and
   is indistinguishable from one that never existed. A wrong owner is
   NOT_FOUND, never FORBIDDEN. */

const NOT_FOUND = () => new AppError('NOT_FOUND', 'That list no longer exists.')

export function listLists(ownerId: string): Promise<List[]> {
  return run('listLists', undefined, async () => {
    await ensureListIndexes()
    const col = await lists()
    const docs = await col
      .find({ ownerId: new ObjectId(ownerId) })
      .sort({ createdAt: 1 })
      .toArray()
    return docs.map(toList)
  })
}

export function createList(
  ownerId: string,
  input: { name: string },
): Promise<List> {
  return run('createList', undefined, async () => {
    await ensureListIndexes()
    const col = await lists()
    const owner = new ObjectId(ownerId)
    const key = normaliseListName(input.name)

    /* Checked before inserting so the message can say what happened; the
       unique index is still the guarantee if two requests race. */
    const existing = await col.findOne({ ownerId: owner, key })
    if (existing) {
      throw new AppError(
        'CONFLICT',
        `You already have a list called “${existing.name}”. Nothing was added.`,
      )
    }

    const now = new Date()
    const doc: ListDoc = {
      ownerId: owner,
      name: input.name,
      key,
      createdAt: now,
      updatedAt: now,
    }
    const result = await col.insertOne(doc)
    return toList({ ...doc, _id: result.insertedId })
  })
}

export function renameList(
  ownerId: string,
  id: string,
  name: string,
): Promise<List> {
  return run('renameList', id, async () => {
    const col = await lists()
    const owner = new ObjectId(ownerId)
    const key = normaliseListName(name)

    const clash = await col.findOne({
      ownerId: owner,
      key,
      _id: { $ne: new ObjectId(id) },
    })
    if (clash) {
      throw new AppError(
        'CONFLICT',
        `You already have a list called “${clash.name}”. Nothing was changed.`,
      )
    }

    const doc = await col.findOneAndUpdate(
      { _id: new ObjectId(id), ownerId: owner },
      { $set: { name, key, updatedAt: new Date() } },
      { returnDocument: 'after' },
    )
    if (!doc) throw NOT_FOUND()
    return toList(doc)
  })
}

/**
 * Deletes the list and UNASSIGNS its tasks. The tasks stay: a list is a
 * label, and removing a label is not removing what it labelled. Returns how
 * many tasks were unassigned, so the client can say so.
 */
export function deleteList(
  ownerId: string,
  id: string,
): Promise<{ id: string; unassigned: number }> {
  return run('deleteList', id, async () => {
    const col = await lists()
    const owner = new ObjectId(ownerId)
    const listId = new ObjectId(id)

    const { deletedCount } = await col.deleteOne({
      _id: listId,
      ownerId: owner,
    })
    if (deletedCount === 0) throw NOT_FOUND()

    // Owner-scoped too, so this can only ever touch the caller's own tasks.
    const taskCol = await tasks()
    const { modifiedCount } = await taskCol.updateMany(
      { ownerId: owner, listId },
      { $set: { listId: null, updatedAt: new Date() } },
    )
    return { id, unassigned: modifiedCount }
  })
}

/**
 * The check a task write makes before pointing at a list. Someone else's
 * list id is NOT_FOUND here for the same reason a task id would be: saying
 * "forbidden" would confirm the id exists.
 */
export async function assertListOwned(
  ownerId: string,
  listId: string,
): Promise<void> {
  const col = await lists()
  const found = await col.findOne(
    { _id: new ObjectId(listId), ownerId: new ObjectId(ownerId) },
    { projection: { _id: 1 } },
  )
  if (!found) throw NOT_FOUND()
}
