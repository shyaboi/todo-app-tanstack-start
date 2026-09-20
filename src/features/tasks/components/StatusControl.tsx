import { StatusPill } from '~/shared/components/Pill'
import { usePlatform } from '~/shared/hooks/usePlatform'
import { displayKeys } from '~/shared/lib/keys'
import { STATUS_LABEL, nextStatus } from '../task.types'
import type { Task, TaskStatus } from '../task.types'
import styles from './StatusControl.module.css'

/* Two ways to change status, one mutation behind both (PLAN.md 4.5):
   the checkbox completes a task, the pill walks it to the next status. */

export function DoneCheckbox({
  task,
  onChange,
  disabled,
}: {
  task: Task
  onChange: (status: TaskStatus) => void
  disabled?: boolean
}) {
  const done = task.status === 'done'
  return (
    <input
      type="checkbox"
      className={styles.checkbox}
      checked={done}
      disabled={disabled}
      // Names the task, not just the control: a screen reader reading the row
      // out of context still knows what is being completed.
      aria-label={
        done ? `Mark "${task.title}" as to do` : `Mark "${task.title}" as done`
      }
      // The keys that set status directly, shown on hover (design rule 03).
      title={done ? 'Mark as to do · 1' : 'Mark as done · 3'}
      onChange={() => onChange(done ? 'todo' : 'done')}
    />
  )
}

export function AdvanceStatusButton({
  task,
  onChange,
  disabled,
}: {
  task: Task
  onChange: (status: TaskStatus) => void
  disabled?: boolean
}) {
  const platform = usePlatform()
  const next = nextStatus(task.status)
  return (
    <button
      type="button"
      className={styles.advance}
      disabled={disabled}
      // The accessible name states the outcome, so the pill's text is not the
      // only thing carrying meaning.
      aria-label={`${task.title}: ${STATUS_LABEL[task.status]}. Change to ${STATUS_LABEL[next]}`}
      // Every visible control shows its key on hover (design rule 03).
      title={`Advance status · ${displayKeys('Space', platform)}`}
      onClick={() => onChange(next)}
    >
      <StatusPill status={task.status} />
    </button>
  )
}
