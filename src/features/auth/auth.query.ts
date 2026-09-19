import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { me, signIn, signOut, signUp } from './auth.server'
import type { SignInInput, SignUpInput } from './auth.schema'

/* Identity is server state like any other, so it lives in the same cache with
   the same contract. The cookie is httpOnly and never readable here -- this
   query asks the server who the caller is, it does not decode anything. */

export const viewerQueryKey = ['viewer'] as const

export const viewerQuery = queryOptions({
  queryKey: viewerQueryKey,
  queryFn: () => me(),
})

/**
 * After any change of identity, everything cached is someone else's.
 *
 * `resetQueries`, not `invalidateQueries`: invalidating refetches while keeping
 * the old data visible, which would briefly show the previous account's tasks
 * to the new one. Reset clears them first.
 */
function useIdentityChanged() {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.resetQueries()
  }
}

export function useSignUp() {
  const identityChanged = useIdentityChanged()
  return useMutation({
    mutationFn: (input: SignUpInput) => signUp({ data: input }),
    onSuccess: identityChanged,
  })
}

export function useSignIn() {
  const identityChanged = useIdentityChanged()
  return useMutation({
    mutationFn: (input: SignInInput) => signIn({ data: input }),
    onSuccess: identityChanged,
  })
}

export function useSignOut() {
  const identityChanged = useIdentityChanged()
  return useMutation({
    mutationFn: () => signOut(),
    onSuccess: identityChanged,
  })
}
