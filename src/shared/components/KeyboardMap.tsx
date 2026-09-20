import { useEffect, useRef } from 'react'
import { Kbd } from './Kbd'
import { Button } from './Button'
import type { Command, CommandGroup } from '../lib/commands'
import styles from './KeyboardMap.module.css'

/* The help overlay is GENERATED from the registry, not transcribed from it.
   That is the whole point: a command whose key changes cannot go stale here,
   and a binding that was never registered cannot be documented as if it were
   (PLAN.md 4.5, design rule "nothing is keyboard-only").

   Hidden commands ARE listed. `hidden` means "not worth a palette row" -- an
   alias, or an arrow key -- and this dialog is precisely where those belong. */

/** A binding the design draws but this build has not implemented yet. */
export interface UnbuiltBinding {
  keys: string
  label: string
}

const GROUP_ORDER: CommandGroup[] = [
  'Tasks',
  'Selected task',
  'Navigate',
  'Filters & views',
  'Help',
]

export function KeyboardMap({
  commands,
  hasSelection,
  unbuilt = [],
  onClose,
}: {
  commands: Command[]
  /** Only to explain the contextual number keys; nothing here is disabled. */
  hasSelection: boolean
  unbuilt?: readonly UnbuiltBinding[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  // Same lifecycle as every other dialog in the app: mounted while open, so
  // focus returns on unmount and the browser owns the trap and the backdrop.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const returnFocusTo = document.activeElement as HTMLElement | null
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      returnFocusTo?.focus()
    }
  }, [])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onCancel = (event: Event) => {
      event.preventDefault()
      onClose()
    }
    dialog.addEventListener('cancel', onCancel)
    return () => dialog.removeEventListener('cancel', onCancel)
  }, [onClose])

  const listed = commands.filter((c) => c.keys)
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: listed.filter((c) => c.group === group),
  })).filter((g) => g.items.length > 0)

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="keyboard-map-title"
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <h2 className={styles.title} id="keyboard-map-title">
            Keyboard
          </h2>
          <p className={styles.lede}>
            Every shortcut also has a visible control. Keys resolve for this
            platform, so ⌘ reads as Ctrl where that is what it is.
          </p>
        </header>

        <div className={styles.columns}>
          {groups.map(({ group, items }) => (
            <section key={group} className={styles.group}>
              <h3 className={styles.groupTitle}>{group}</h3>
              <dl className={styles.rows}>
                {items.map((command) => (
                  <div key={command.id} className={styles.row}>
                    <dt className={styles.keys}>
                      <Kbd keys={command.keys!} />
                    </dt>
                    <dd className={styles.label}>
                      {command.label}
                      {command.when === 'selection' && !hasSelection && (
                        <span className={styles.note}>
                          {' '}
                          — with a task selected
                        </span>
                      )}
                      {command.when === 'no-selection' && hasSelection && (
                        <span className={styles.note}>
                          {' '}
                          — with nothing selected
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        {/* Stated rather than silently absent: the design's key map includes the
            board and detail bindings, and a help overlay that listed them would
            be promising keys that do nothing. */}
        {unbuilt.length > 0 && (
          <section className={styles.unbuilt}>
            <h3 className={styles.groupTitle}>Not in this build yet</h3>
            <ul className={styles.unbuiltList}>
              {unbuilt.map((binding) => (
                <li key={binding.keys} className={styles.unbuiltRow}>
                  <Kbd keys={binding.keys} />
                  <span className={styles.label}>{binding.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className={styles.footer}>
          <p className={styles.dismiss}>
            <Kbd keys="esc" /> closes this
          </p>
          <Button variant="secondary" size="small" onClick={onClose}>
            Close
          </Button>
        </footer>
      </div>
    </dialog>
  )
}
