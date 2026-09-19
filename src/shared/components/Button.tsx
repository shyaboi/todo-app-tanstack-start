import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

type BaseProps = {
  variant?: Variant
  size?: 'default' | 'small'
  /** Swaps the label for a spinner and blocks interaction while a mutation runs. */
  loading?: boolean
  /** Announced while loading. Defaults to the design's own wording. */
  loadingLabel?: string
  iconOnly?: boolean
}

/* The design requires every icon-only button to carry an accessible name.
   Expressing that as a union makes it a compile error to omit one, rather
   than something the a11y pass has to catch later. */
type WithAccessibleName =
  { children: ReactNode } | { 'aria-label': string; children?: ReactNode }

export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className'
> &
  BaseProps &
  WithAccessibleName

export function Button({
  variant = 'secondary',
  size = 'default',
  loading = false,
  loadingLabel = 'Saving…',
  iconOnly = false,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const className = [
    styles.button,
    styles[variant],
    size === 'small' && styles.small,
    iconOnly && styles.iconOnly,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      // Defaulting to "button" stops a button inside a form from submitting it
      // by accident -- the composer depends on this.
      type={type}
      className={className}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          <span>{iconOnly ? null : loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}
