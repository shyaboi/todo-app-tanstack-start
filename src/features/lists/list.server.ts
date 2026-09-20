import { createServerFn } from '@tanstack/react-start'
import { ensureViewer } from '~/features/auth/auth.service'
import { wire } from '~/server/boundary'
import {
  createListInput,
  deleteListInput,
  renameListInput,
} from './list.schema'
import * as service from './list.service'
import type { List } from './list.types'

/* The boundary for lists, shaped exactly like the one for tasks: the schema
   validates, the session supplies the owner, the service enforces. */

export const listLists = createServerFn({ method: 'GET' }).handler(
  (): Promise<List[]> =>
    wire(async () => {
      const viewer = await ensureViewer()
      return service.listLists(viewer.userId)
    }),
)

export const createList = createServerFn({ method: 'POST' })
  .validator(createListInput)
  .handler(({ data }): Promise<List> =>
    wire(async () => {
      const viewer = await ensureViewer()
      return service.createList(viewer.userId, data)
    }),
  )

export const renameList = createServerFn({ method: 'POST' })
  .validator(renameListInput)
  .handler(({ data }): Promise<List> =>
    wire(async () => {
      const viewer = await ensureViewer()
      return service.renameList(viewer.userId, data.id, data.name)
    }),
  )

export const deleteList = createServerFn({ method: 'POST' })
  .validator(deleteListInput)
  .handler(({ data }): Promise<{ id: string; unassigned: number }> =>
    wire(async () => {
      const viewer = await ensureViewer()
      return service.deleteList(viewer.userId, data.id)
    }),
  )
