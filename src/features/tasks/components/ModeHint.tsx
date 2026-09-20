import { Kbd } from '~/shared/components/Kbd'
import styles from './ModeHint.module.css'

/**
 * The design's mode hint strip.
 *
 * `1 2 3` mean two different things depending on whether a row is selected,
 * which is the one genuinely modal thing in the app -- so it is the one thing
 * that gets a permanent readout. The strip also carries the visible controls
 * for ⌘K and ?, the two shortcuts that would otherwise have none.
 *
 * Announced politely rather than hidden: the mode is the reason a number key
 * did one thing a moment ago and another now, which a screen reader user needs
 * as much as anyone. The key hints inside it are decorative and marked so.
 */
export function ModeHint({
  hasSelection,
  onOpenPalette,
  onOpenHelp,
}: {
  hasSelection: boolean
  onOpenPalette: () => void
  onOpenHelp: () => void
}) {
  return (
    <div className={styles.strip}>
      <p className={styles.mode} aria-live="polite">
        <span className={styles.keys} aria-hidden="true">
          <Kbd keys="1 2 3" />
        </span>
        {hasSelection
          ? 'set the selected task’s status'
          : 'filter the list by status'}
      </p>

      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={onOpenPalette}>
          Commands
          <span aria-hidden="true">
            <Kbd keys="⌘K" />
          </span>
        </button>
        <button type="button" className={styles.action} onClick={onOpenHelp}>
          Keyboard
          <span aria-hidden="true">
            <Kbd keys="?" />
          </span>
        </button>
      </div>
    </div>
  )
}
