import { describeError } from '~/shared/lib/describeError'
import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { CredentialsForm } from '~/features/auth/components/CredentialsForm'
import { useSignIn } from '~/features/auth/auth.query'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
  head: () => ({ meta: [{ title: 'Sign in · Tasker' }] }),
})

function SignInPage() {
  const router = useRouter()
  const signIn = useSignIn()
  const [error, setError] = useState<string | null>(null)

  return (
    <CredentialsForm
      mode="sign-in"
      pending={signIn.isPending}
      formError={error}
      onSubmit={(credentials) => {
        setError(null)
        signIn.mutate(credentials, {
          onSuccess: () => {
            // navigate, not a full reload: the cache was already reset, so the
            // list re-fetches for the new identity on arrival.
            void router.navigate({ to: '/' })
          },
          onError: (e: unknown) =>
            setError(
              e instanceof Error
                ? describeError(e).message
                : 'Could not sign you in. Try again in a moment.',
            ),
        })
      }}
    />
  )
}
