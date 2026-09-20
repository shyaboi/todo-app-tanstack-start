import '@tanstack/react-start/server-only'
import type { Collection, Document, ObjectId, WithId } from 'mongodb'
import { getDb } from '~/server/db'
import type { List } from './list.types'

/* The persistence shape, distinct from the DTO for the same reasons as tasks
   (Failure Check 5). `key` is the normalised name, indexed unique per owner,
   so "Docs" and "docs" cannot both exist and the composer's `#docs` has one
   answer. */
export interface ListDoc extends Document {
  ownerId: ObjectId
  name: string
  key: string
  createdAt: Date
  updatedAt: Date
}

export const LISTS_COLLECTION = 'lists'

export async function lists(): Promise<Collection<ListDoc>> {
  const db = await getDb()
  return db.collection<ListDoc>(LISTS_COLLECTION)
}

/** The boundary map: every read funnels through here. */
export function toList(doc: WithId<ListDoc>): List {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    createdAt: doc.createdAt.toISOString(),
  }
}

let indexesReady: Promise<void> | null = null

export function ensureListIndexes(): Promise<void> {
  indexesReady ??= (async () => {
    const col = await lists()
    await col.createIndexes([
      // Every read is owner-scoped; the unique key makes names unique per owner.
      { key: { ownerId: 1, key: 1 }, name: 'owner_key', unique: true },
      { key: { ownerId: 1, createdAt: 1 }, name: 'owner_createdAt' },
    ])
  })().catch((error: unknown) => {
    indexesReady = null
    throw error
  })
  return indexesReady
}

/** Moves a guest's lists to the account that adopted the guest's tasks. */
export async function reassignListOwner(
  from: ObjectId,
  to: ObjectId,
): Promise<number> {
  const col = await lists()
  const { modifiedCount } = await col.updateMany(
    { ownerId: from },
    { $set: { ownerId: to, updatedAt: new Date() } },
  )
  return modifiedCount
}
