import { useId } from 'react'
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import styles from './Field.module.css'

type Common = {
  label: string
  /** Rendered under the control, and wired up via aria-describedby. */
  description?: string
  /** Presence marks the field invalid and moves the message into the a11y tree. */
  error?: string
  required?: boolean
  /**
   * A fixed id, for the one case a generated one cannot serve: a shortcut that
   * has to land focus on this exact control from elsewhere on the page.
   */
  id?: string
}

export type FieldProps = Common &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> & {
    multiline?: false
    select?: false
  }

export type TextareaFieldProps = Common &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'> & {
    multiline: true
    select?: false
  }

export type SelectFieldProps = Common &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'> & {
    select: true
    multiline?: false
  }

/* A real <label for>, not a placeholder standing in for one. `useId` keeps the
   association stable across SSR and hydration, which a module-level counter
   would not. */
export function Field(
  props: FieldProps | TextareaFieldProps | SelectFieldProps,
) {
  const {
    label,
    description,
    error,
    required,
    multiline,
    select,
    id: fixedId,
    ...rest
  } = props
  const generatedId = useId()
  const id = fixedId ?? generatedId
  const describedBy =
    [description && `${id}-desc`, error && `${id}-err`]
      .filter(Boolean)
      .join(' ') || undefined

  const shared = {
    id,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': describedBy,
    required,
    className: [styles.control, error && styles.invalid]
      .filter(Boolean)
      .join(' '),
  }

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        )}
      </label>

      {multiline ? (
        <textarea
          {...shared}
          className={`${shared.className} ${styles.textarea}`}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : select ? (
        <select
          {...shared}
          className={`${shared.className} ${styles.select}`}
          {...(rest as SelectHTMLAttributes<HTMLSelectElement>)}
        />
      ) : (
        <input
          {...shared}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}

      {description && (
        <p className={styles.description} id={`${id}-desc`}>
          {description}
        </p>
      )}

      {/* role="alert" so a validation failure is announced, not just shown. */}
      {error && (
        <p className={styles.error} id={`${id}-err`} role="alert">
          <span className={styles.errorDot} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
