import { createServerFn } from '@tanstack/react-start'
import { signInInput, signUpInput } from './auth.schema'
import * as service from './auth.service'
import type { User, Viewer } from './auth.types'

/* Credentials cross this boundary, so nothing here is logged and nothing
   returned carries more than the User DTO (PLAN.md 4.8). */

export const signUp = createServerFn({ method: 'POST' })
  .validator(signUpInput)
  .handler(({ data }): Promise<User> =>
    service.signUp(data.email, data.password),
  )

export const signIn = createServerFn({ method: 'POST' })
  .validator(signInInput)
  .handler(({ data }): Promise<User> =>
    service.signIn(data.email, data.password),
  )

export const signOut = createServerFn({ method: 'POST' }).handler(
  (): Promise<void> => service.signOut(),
)

/** Who the caller is, or null. Safe to call anonymously. */
export const me = createServerFn({ method: 'GET' }).handler(
  (): Promise<Viewer | null> => service.currentViewer(),
)
