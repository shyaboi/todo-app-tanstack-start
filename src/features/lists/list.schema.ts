import { z } from 'zod'

/* One schema module for the form and the server function, as with tasks. */

/** Messages are user-facing. They say what to do, not what failed. */
export const listNameSchema = z
  .string({ error: 'Give the list a name.' })
  .trim()
  .min(1, 'Give the list a name.')
  .max(40, 'Keep the name to 40 characters or fewer.')
  /* A name that would parse as a composer token would be unreachable from
     the composer, and `#` inside a name is a tag inside a tag. */
  .refine((n) => !/[#!~]/.test(n), {
    error: 'A list name cannot contain #, ! or ~.',
  })

/** A Mongo ObjectId in hex. Rejects anything that could not be one. */
export const listIdSchema = z
  .string()
  .regex(/^[0-9a-f]{24}$/i, 'That is not a valid list id.')

export const createListInput = z.strictObject({ name: listNameSchema })
export type CreateListInput = z.input<typeof createListInput>

export const renameListInput = z.strictObject({
  id: listIdSchema,
  name: listNameSchema,
})
export type RenameListInput = z.input<typeof renameListInput>

export const deleteListInput = z.strictObject({ id: listIdSchema })
