import { useRef, useState } from 'react'
import { Button } from '~/shared/components/Button'
import { Chip } from '~/shared/components/Pill'
import { Kbd } from '~/shared/components/Kbd'
import { useCreateTask } from '../task.query'
import { titleSchema } from '../task.schema'
import type { CreateTaskInput } from '../task.schema'
import { parseComposer } from '../task.parse'
import type { ParsedToken } from '../task.parse'
import { PRIORITY_LABEL, STATUS_LABEL, listName } from '../task.types'
import styles from './TaskComposer.module.css'

/**
 * A fixed id, so the N shortcut can land focus here without the page holding
 * a ref to a child. There is one composer on the page, which is what makes
 * an id the honest choice; a ref would be the answer for a repeated control.
 */
export const COMPOSER_INPUT_ID = 'task-composer-input'

/**
 * One field that understands `#list !p1 ~doing tomorrow 4pm` (PLAN.md D9).
 *
 * The text is parsed on every keystroke and the reading is shown as chips
 * under the input, so a wrong guess -- and plain-English dates do guess -- is
 * visible before Enter, not after. Nothing is resolved twice: the same parse
 * that drew the chips is what gets sent.
 */
export function TaskComposer() {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const create = useCreateTask()

  /* Parsed at render from the draft. `new Date()` here is safe for hydration:
     the draft is empty on the server, and an empty draft never reaches the
     date parser. */
  const parsed = parseComposer(text, new Date())

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()

    /* The same schema the server function runs. Validating here is a courtesy
       to the user, not a security measure -- the server validates regardless
       (Failure Check 4). */
    const title = titleSchema.safeParse(parsed.title)
    if (!title.success) {
      setError(
        parsed.tokens.length > 0 && parsed.title === ''
          ? 'Give the task a title as well as the tags.'
          : (title.error.issues[0]?.message ?? 'That title is not valid.'),
      )
      inputRef.current?.focus()
      return
    }

    const input: CreateTaskInput = { title: title.data }
    if (parsed.listId) input.listId = parsed.listId
    if (parsed.priority) input.priority = parsed.priority
    if (parsed.status) input.status = parsed.status
    if (parsed.dueAt) input.dueAt = parsed.dueAt

    setError(null)
    /* Cleared at once so the next task can be typed immediately. A failure is
       not reported here: the mutation hook rolls the cache back and raises
       the failure toast, whose Retry re-sends exactly this input. The message
       under the field is for validation, which happens before anything is
       sent. */
    create.mutate(input)
    setText('')
  }

  const showHint = focused || text !== ''

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.bar}>
        {/* A real label, visually hidden: the placeholder is not a label. */}
        <label className="visually-hidden" htmlFor={COMPOSER_INPUT_ID}>
          Task title
        </label>
        <input
          id={COMPOSER_INPUT_ID}
          ref={inputRef}
          className={styles.input}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (error) setError(null)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Add a task… try #docs !p1 tomorrow 4pm"
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [error && `${COMPOSER_INPUT_ID}-err`, `${COMPOSER_INPUT_ID}-hint`]
              .filter(Boolean)
              .join(' ') || undefined
          }
          autoComplete="off"
        />
        <span className={styles.key}>
          <Kbd keys="N" />
        </span>
        <Button type="submit" variant="primary" loading={create.isPending}>
          Add task
        </Button>
      </div>

      {/* What the parser understood, as it is typed. Not a live region: a
          chip that re-announced on every keystroke would drown the typing.
          The hint is described-by the input instead, so it is read once. */}
      {parsed.tokens.length > 0 && (
        <p className={styles.reading} data-testid="composer-reading">
          <span className={styles.readingLabel}>Understood as</span>
          {parsed.tokens.map((token) => (
            <Chip key={`${token.kind}-${token.raw}`} variant="outline">
              {describe(token)}
            </Chip>
          ))}
        </p>
      )}

      <p
        className={`${styles.hint} ${showHint ? styles.hintVisible : ''}`}
        id={`${COMPOSER_INPUT_ID}-hint`}
      >
        <code>#list</code> <code>!p1</code>–<code>!p3</code> <code>~todo</code>{' '}
        <code>~doing</code> <code>~done</code> and dates like{' '}
        <em>tomorrow 4pm</em> or <em>next friday</em>.
      </p>

      {error && (
        <p
          className={styles.error}
          id={`${COMPOSER_INPUT_ID}-err`}
          role="alert"
        >
          <span className={styles.dot} aria-hidden="true" />
          {error}
        </p>
      )}
    </form>
  )
}

/* Formatted with an explicit locale so the server and the client agree, the
   same reason the row does it; the composer never renders a date on the
   server, but the rule is cheaper to keep than to remember. */
const dueFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function describe(token: ParsedToken): string {
  switch (token.kind) {
    case 'list':
      return `List · ${listName(token.listId) ?? token.listId}`
    case 'priority':
      return PRIORITY_LABEL[token.priority]
    case 'status':
      return `Status · ${STATUS_LABEL[token.status]}`
    case 'date':
      return `Due · ${dueFormat.format(new Date(token.dueAt))}`
  }
}
