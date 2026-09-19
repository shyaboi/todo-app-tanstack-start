import '@tanstack/react-start/server-only'
import { MongoClient } from 'mongodb'
import type { Db, MongoClientOptions } from 'mongodb'
import { env } from './env'

/* The native driver, not an ODM. PLAN.md 4.4 and system design 19: no generic
   repository framework -- the persistence layer here is small enough that a
   schema layer on top of Zod would be a second source of truth. */

const options: MongoClientOptions = {
  // Fail fast and surface DB_UNAVAILABLE rather than hanging a request for
  // 30s. The UI can only show a retry if it is told promptly.
  serverSelectionTimeoutMS: 5_000,
  connectTimeoutMS: 10_000,
  // Small pool: this app's workload is a handful of queries per request.
  maxPoolSize: 10,
  retryWrites: true,
}

/* Dev servers hot-reload this module and serverless platforms re-enter it on
   every invocation. Without a cache that outlives the module instance, each
   reload opens a new pool and Atlas eventually refuses connections. Stashing
   the promise on globalThis is the standard fix and is server-only by
   construction. */
declare global {
  var __taskerMongo: Promise<MongoClient> | undefined
}

function connect(): Promise<MongoClient> {
  const { MONGODB_URI } = env()
  return new MongoClient(MONGODB_URI, options).connect()
}

export function getClient(): Promise<MongoClient> {
  if (!globalThis.__taskerMongo) {
    globalThis.__taskerMongo = connect().catch((error: unknown) => {
      // Clear the cache so the next request retries instead of forever
      // awaiting a rejected promise.
      globalThis.__taskerMongo = undefined
      throw error
    })
  }
  return globalThis.__taskerMongo
}

export async function getDb(): Promise<Db> {
  const client = await getClient()
  return client.db(env().MONGODB_DB)
}

/** Closes the pool. For test teardown and graceful shutdown only. */
export async function closeClient(): Promise<void> {
  const pending = globalThis.__taskerMongo
  globalThis.__taskerMongo = undefined
  if (pending) await (await pending).close()
}
