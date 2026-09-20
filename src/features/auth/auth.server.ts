import { createServerFn } from '@tanstack/react-start'
import { wire } from '~/server/boundary'
import { signInInput, signUpInput } from './auth.schema'
import * as service from './auth.service'
import type { User, Viewer } from './auth.types'

/* Credentials cross this boundary, so nothing here is logged and nothing
   returned carries more than the User DTO (PLAN.md 4.8).

   `wire` on every handler, as on the task and list boundaries: a sign-in
   failure has a message written to be read ("Those details do not match an
   account") and it only reaches the form if the code travels with it. */

export const signUp = createServerFn({ method: 'POST' })
  .validator(signUpInput)
  .handler(({ data }): Promise<User> =>
    wire(() => service.signUp(data.email, data.password)),
  )

export const signIn = createServerFn({ method: 'POST' })
  .validator(signInInput)
  .handler(({ data }): Promise<User> =>
    wire(() => service.signIn(data.email, data.password)),
  )

export const signOut = createServerFn({ method: 'POST' }).handler(
  (): Promise<void> => wire(() => service.signOut()),
)

/** Who the caller is, or null. Safe to call anonymously. */
export const me = createServerFn({ method: 'GET' }).handler(
  (): Promise<Viewer | null> => wire(() => service.currentViewer()),
)
