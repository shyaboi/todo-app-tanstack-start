import { createServerFn } from '@tanstack/react-start'
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
   they can reach a browser. */

export const listTodos = createServerFn({ method: 'GET' })
  .validator(listTasksInput)
  .handler(({ data }): Promise<Task[]> => service.listTasks(data))

export const createTodo = createServerFn({ method: 'POST' })
  .validator(createTaskInput)
  .handler(({ data }): Promise<Task> => service.createTask(data))

export const updateTodo = createServerFn({ method: 'POST' })
  .validator(updateTaskInput)
  .handler(({ data }): Promise<Task> => service.updateTask(data.id, data.patch))

export const deleteTodo = createServerFn({ method: 'POST' })
  .validator(deleteTaskInput)
  .handler(({ data }): Promise<{ id: string; undoToken: string }> =>
    service.deleteTask(data.id),
  )

export const restoreTodo = createServerFn({ method: 'POST' })
  .validator(restoreTaskInput)
  .handler(({ data }): Promise<Task> => service.restoreTask(data.undoToken))
