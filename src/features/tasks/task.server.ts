import { createServerFn } from '@tanstack/react-start'
import { ensureViewer } from '~/features/auth/auth.service'
import {
  createTaskInput,
  deleteTaskInput,
  listTasksInput,
  restoreTaskInput,
  updateTaskInput,
} from './task.schema'
import * as service from './task.service'
import type { Task } from './task.types'

/* The application boundary. Everything above this line is untrusted input;
   everything below it is parsed and trusted.

   `.validator` runs the same Zod schema the form uses, so a request that
   bypasses the UI is held to exactly the same rules (system design 4, 15,
   Failure Check 4). The service converts driver errors into AppError before
   they can reach a browser.

   Every handler resolves the owner from the session itself. `ownerId` is not in
   any input schema, so a caller cannot supply one -- and because the schemas are
   strict, attempting to is a validation error rather than something silently
   ignored (PLAN.md 4.8).

   `ensureViewer` rather than `requireViewer`: an anonymous visitor gets a guest
   account, so the app is usable before signing up. Guests are ordinary owners,
   so there is no second, weaker code path for their data. */

export const listTodos = createServerFn({ method: 'GET' })
  .validator(listTasksInput)
  .handler(async ({ data }): Promise<Task[]> => {
    const viewer = await ensureViewer()
    return service.listTasks(viewer.userId, data)
  })

export const createTodo = createServerFn({ method: 'POST' })
  .validator(createTaskInput)
  .handler(async ({ data }): Promise<Task> => {
    const viewer = await ensureViewer()
    return service.createTask(viewer.userId, data)
  })

export const updateTodo = createServerFn({ method: 'POST' })
  .validator(updateTaskInput)
  .handler(async ({ data }): Promise<Task> => {
    const viewer = await ensureViewer()
    return service.updateTask(viewer.userId, data.id, data.patch)
  })

export const deleteTodo = createServerFn({ method: 'POST' })
  .validator(deleteTaskInput)
  .handler(async ({ data }): Promise<{ id: string; undoToken: string }> => {
    const viewer = await ensureViewer()
    return service.deleteTask(viewer.userId, data.id)
  })

export const restoreTodo = createServerFn({ method: 'POST' })
  .validator(restoreTaskInput)
  .handler(async ({ data }): Promise<Task> => {
    const viewer = await ensureViewer()
    return service.restoreTask(viewer.userId, data.undoToken)
  })
