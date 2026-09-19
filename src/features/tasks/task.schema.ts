import { z } from 'zod'
import { TASK_STATUSES, PRIORITIES, LIST_IDS } from './task.types'

/* One schema module, imported by the form AND by the server function.
   That is the point: the client cannot show a state the server would reject,
   and a hand-crafted request cannot slip past the form's rules.

   TypeScript types are developer ergonomics; this file is the runtime
   boundary (system design 4, 15, Failure Check 4). */

/** Messages are user-facing. They say what to do, not what failed. */
export const titleSchema = z
  .string({ error: 'Give the task a title.' })
  .trim()
  .min(1, 'Give the task a title.')
  .max(200, 'Keep the title to 200 characters or fewer.')

export const notesSchema = z
  .string()
  .trim()
  .max(2000, 'Keep notes to 2000 characters or fewer.')

export const statusSchema = z.enum(TASK_STATUSES)
export const prioritySchema = z.enum(PRIORITIES)
export const listIdSchema = z.enum(LIST_IDS)

/** A Mongo ObjectId in hex. Rejects anything that could not be one. */
export const taskIdSchema = z
  .string()
  .regex(/^[0-9a-f]{24}$/i, 'That is not a valid task id.')

/* An exact instant, not a date. The composer resolves "tomorrow 4pm"
   client-side and sends the resolved instant, exactly as the design's
   validation contract specifies. */
export const dueAtSchema = z.iso.datetime({
  error: 'Due date must be an exact time.',
})

/** `undefined` and `null` both mean "no value" at the boundary; store null. */
const nullableOptional = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((v) => (v === undefined ? null : v))

/*  strictObject, so an unknown field is an error rather than silently dropped.
    This is what "accept only allowed fields" means in practice, and it is why
    id / createdAt / updatedAt cannot be supplied by a client: they are not in
    the shape at all, so sending one is rejected. */
export const createTaskInput = z.strictObject({
  title: titleSchema,
  notes: nullableOptional(notesSchema),
  status: statusSchema.default('todo'),
  dueAt: nullableOptional(dueAtSchema),
  priority: prioritySchema.default('p2'),
  listId: nullableOptional(listIdSchema),
})

export type CreateTaskInput = z.input<typeof createTaskInput>
export type CreateTaskParsed = z.output<typeof createTaskInput>

/** Every field optional, but at least one required: an empty patch is a bug. */
export const taskPatch = z
  .strictObject({
    title: titleSchema,
    notes: nullableOptional(notesSchema),
    status: statusSchema,
    dueAt: nullableOptional(dueAtSchema),
    priority: prioritySchema,
    listId: nullableOptional(listIdSchema),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, {
    error: 'Nothing to update.',
  })

export type TaskPatchInput = z.input<typeof taskPatch>

export const updateTaskInput = z.strictObject({
  id: taskIdSchema,
  patch: taskPatch,
})

export type UpdateTaskInput = z.input<typeof updateTaskInput>

export const deleteTaskInput = z.strictObject({ id: taskIdSchema })

/* Filters are validated too. They reach the database, so they are as untrusted
   as anything else -- and `q` in particular must never become a Mongo operator
   (system design 15). */
export const listTasksInput = z.strictObject({
  q: z.string().trim().max(200).optional(),
  status: z.array(statusSchema).max(3).optional(),
  due: z.enum(['any', 'overdue', 'today', 'week', 'none']).optional(),
  listId: listIdSchema.optional(),
  sort: z.enum(['due', 'created', 'relevance']).optional(),
})

export type ListTasksInput = z.input<typeof listTasksInput>

/** Field-level messages for a form, keyed by field name. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    out[key] ??= issue.message
  }
  return out
}
