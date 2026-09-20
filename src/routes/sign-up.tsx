import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { CredentialsForm } from '~/features/auth/components/CredentialsForm'
import { useSignUp } from '~/features/auth/auth.query'

export const Route = createFileRoute('/sign-up')({
  component: SignUpPage,
  head: () => ({ meta: [{ title: 'Create an account · Tasker' }] }),
})

function SignUpPage() {
  const router = useRouter()
  const signUp = useSignUp()
  const [error, setError] = useState<string | null>(null)

  return (
    <CredentialsForm
      mode="sign-up"
      pending={signUp.isPending}
      formError={error}
      onSubmit={(credentials) => {
        setError(null)
        signUp.mutate(credentials, {
          /* Anything added as a guest is already owned by this account -- signing
             up claims the same row rather than creating a second one, so there
             is nothing to migrate and nothing to wait for. */
          onSuccess: () => {
            void router.navigate({ to: '/' })
          },
          onError: (e: unknown) =>
            setError(
              e instanceof Error
                ? e.message
                : 'Could not create your account. Try again in a moment.',
            ),
        })
      }}
    />
  )
}
