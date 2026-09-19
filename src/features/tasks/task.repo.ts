import '@tanstack/react-start/server-only'
import { ObjectId } from 'mongodb'
import type { Collection, Document, WithId } from 'mongodb'
import { getDb } from '~/server/db'
import type { ListId, Priority, Task, TaskStatus } from './task.types'

/* The persistence shape. It differs from `Task` on purpose: dates are stored
   as Date so Mongo can compare and index them, and the id is an ObjectId.
   Neither of those may reach a component (Failure Check 5). */
export interface TaskDoc extends Document {
  title: string
  notes: string | null
  status: TaskStatus
  dueAt: Date | null
  priority: Priority
  listId: ListId | null
  createdAt: Date
  updatedAt: Date
}

export const COLLECTION = 'tasks'

/* Deleted tasks are parked here for the length of the undo window, then they
   are gone. This is NOT soft deletion as a domain feature -- nothing reads
   from this collection except restoreTodo, and the TTL index clears it
   automatically, so no sweeper process is needed (system design 19). */
export const TRASH_COLLECTION = 'tasks_trash'

export interface TrashDoc extends Document {
  /** Opaque token handed to the client; the only key it can restore with. */
  token: string
  task: TaskDoc & { _id: ObjectId }
  deletedAt: Date
}

export async function tasks(): Promise<Collection<TaskDoc>> {
  const db = await getDb()
  return db.collection<TaskDoc>(COLLECTION)
}

export async function trash(): Promise<Collection<TrashDoc>> {
  const db = await getDb()
  return db.collection<TrashDoc>(TRASH_COLLECTION)
}

/**
 * The boundary map. Every read path funnels through here, so a driver shape
 * can never travel further into the app than this function.
 */
export function toTask(doc: WithId<TaskDoc>): Task {
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    notes: doc.notes ?? null,
    status: doc.status,
    // ISO strings cross the wire: a Date would be serialised inconsistently
    // and arrive at the client as a string anyway.
    dueAt: doc.dueAt ? doc.dueAt.toISOString() : null,
    priority: doc.priority,
    listId: doc.listId ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

/** Narrow, validated input only -- never a raw object from a request. */
export function toObjectId(id: string): ObjectId {
  return new ObjectId(id)
}

/* Indexes are created once, lazily, rather than in a migration step, because
   this app has exactly two of them and no migration story. createIndexes is
   idempotent, so calling it repeatedly is safe. */
let indexesReady: Promise<void> | null = null

export function ensureIndexes(): Promise<void> {
  indexesReady ??= (async () => {
    const col = await tasks()
    await col.createIndexes([
      // The default list order: newest first.
      { key: { createdAt: -1 }, name: 'createdAt_desc' },
      // Supports status filtering and the board's per-column queries.
      { key: { status: 1, dueAt: 1 }, name: 'status_dueAt' },
      // Text search over the fields the design says search matches.
      { key: { title: 'text', notes: 'text' }, name: 'title_notes_text' },
    ])

    const bin = await trash()
    await bin.createIndexes([
      { key: { token: 1 }, name: 'token', unique: true },
      /* Mongo expires these itself. The undo window is 8 seconds; 5 minutes of
         slack covers a slow network and a distracted user without turning the
         trash into a second source of task data. */
      { key: { deletedAt: 1 }, name: 'ttl', expireAfterSeconds: 300 },
    ])
  })().catch((error: unknown) => {
    // Let the next call retry rather than caching a rejection forever.
    indexesReady = null
    throw error
  })
  return indexesReady
}
