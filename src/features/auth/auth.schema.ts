import { z } from 'zod'

/* One schema, used by the sign-in form AND by the server function, so the
   client cannot present something the server would reject and a hand-crafted
   request cannot skip the rules. */

export const emailSchema = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .min(3, 'Enter your email address.')
  .max(254, 'That email address is too long.')
  .email('Enter a valid email address.')

/* 12 characters minimum with no composition rules, which is current guidance:
   length beats mandatory symbols, and "must contain a number" mostly produces
   predictable substitutions. The upper bound exists because scrypt hashes
   whatever it is given and an unbounded field is a denial-of-service knob. */
export const passwordSchema = z
  .string({ error: 'Choose a password.' })
  .min(12, 'Use at least 12 characters.')
  .max(200, 'Use 200 characters or fewer.')

export const signUpInput = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
})

/* Sign-in does NOT reuse passwordSchema. Rejecting a short password here would
   tell an attacker the rules without an account, and worse, a legacy password
   that no longer meets today's minimum must still be able to sign in. */
export const signInInput = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(200),
})

export type SignUpInput = z.input<typeof signUpInput>
export type SignInInput = z.input<typeof signInInput>
