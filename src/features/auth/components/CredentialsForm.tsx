import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '~/shared/components/Button'
import { Field } from '~/shared/components/Field'
import { emailSchema, passwordSchema } from '../auth.schema'
import styles from './CredentialsForm.module.css'

type Mode = 'sign-in' | 'sign-up'

/* FormData.get returns string | File. Stringifying a File would quietly submit
   "[object File]" as a password, so a non-string reads as empty and fails
   validation instead. */
function textField(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

const COPY = {
  'sign-in': {
    title: 'Sign in',
    lede: 'Your tasks are waiting.',
    submit: 'Sign in',
    swapText: 'New here?',
    swapLabel: 'Create an account',
    swapTo: '/sign-up' as const,
    passwordHint: undefined,
  },
  'sign-up': {
    title: 'Create an account',
    lede: 'Anything you have already added stays with you.',
    submit: 'Create account',
    swapText: 'Already have an account?',
    swapLabel: 'Sign in',
    swapTo: '/sign-in' as const,
    passwordHint: 'At least 12 characters.',
  },
} satisfies Record<Mode, unknown>

/**
 * One form for both routes. The two differ in copy and in which validation
 * runs, not in structure -- and a second near-identical form is how the two
 * drift apart.
 */
export function CredentialsForm({
  mode,
  pending,
  formError,
  onSubmit,
}: {
  mode: Mode
  pending: boolean
  /** A server-side failure, already sanitised. Shown above the fields. */
  formError: string | null
  onSubmit: (credentials: { email: string; password: string }) => void
}) {
  const copy = COPY[mode]
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  )

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = textField(form, 'email')
    const password = textField(form, 'password')

    const emailResult = emailSchema.safeParse(email)
    const next: { email?: string; password?: string } = {}

    if (!emailResult.success) {
      next.email = emailResult.error.issues[0]?.message ?? 'Check this address.'
    }

    /* Sign-in deliberately does not apply passwordSchema. Rejecting a short
       password here would state the rules to someone without an account, and a
       password that predates today's minimum must still be able to sign in. */
    if (mode === 'sign-up') {
      const result = passwordSchema.safeParse(password)
      if (!result.success) {
        next.password =
          result.error.issues[0]?.message ?? 'Check this password.'
      }
    } else if (password.length === 0) {
      next.password = 'Enter your password.'
    }

    setErrors(next)
    // Narrowed on the parse result itself, so the trimmed, lowercased address
    // is what gets sent rather than the raw input.
    if (!emailResult.success || next.password) return

    onSubmit({ email: emailResult.data, password })
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{copy.title}</h1>
      <p className={styles.lede}>{copy.lede}</p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {/* role="alert" so a rejected sign-in is announced, not just shown. */}
        {formError && (
          <p className={styles.banner} role="alert">
            {formError}
          </p>
        )}

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={errors.email}
        />

        <Field
          label="Password"
          name="password"
          type="password"
          // Tells a password manager which of the two this is, so it offers to
          // save a new password rather than autofilling an old one.
          autoComplete={
            mode === 'sign-up' ? 'new-password' : 'current-password'
          }
          required
          {...(copy.passwordHint ? { description: copy.passwordHint } : {})}
          error={errors.password}
        />

        <Button type="submit" variant="primary" loading={pending}>
          {copy.submit}
        </Button>
      </form>

      <p className={styles.swap}>
        {copy.swapText}{' '}
        <Link to={copy.swapTo} className={styles.link}>
          {copy.swapLabel}
        </Link>
      </p>
    </main>
  )
}
