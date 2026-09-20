import { useId } from 'react'
import type { SortOrder } from '../task.filters'
import styles from './SortSelect.module.css'

const OPTIONS: readonly { value: SortOrder; label: string }[] = [
  { value: 'due', label: 'Due date' },
  { value: 'created', label: 'Newest first' },
  { value: 'relevance', label: 'Relevance' },
]

const isSortOrder = (v: string): v is SortOrder =>
  OPTIONS.some((o) => o.value === v)

/**
 * A native <select>. It is keyboard-operable, announced correctly and works
 * on touch without any code here, which a custom listbox would have to earn
 * back one behaviour at a time. Controlled by the page, which owns the URL.
 */
export function SortSelect({
  value,
  onChange,
}: {
  value: SortOrder
  onChange: (sort: SortOrder) => void
}) {
  const id = useId()
  return (
    <div className={styles.wrap}>
      <label className={styles.label} htmlFor={id}>
        Sort
      </label>
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(e) => {
          const next = e.target.value
          // Narrowed rather than cast: a select can only offer these values,
          // but the DOM hands back a string and the type should say so.
          if (isSortOrder(next)) onChange(next)
        }}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
