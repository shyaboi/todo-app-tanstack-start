import { Kbd } from '~/shared/components/Kbd'
import styles from './ModeHint.module.css'

/**
 * The design's mode hint strip.
 *
 * Each page has one genuinely modal thing -- on the list, `1 2 3` mean two
 * different things depending on whether a row is selected; on the board, the
 * arrows either walk the columns or carry a picked-up card -- so that one
 * thing gets a permanent readout. The strip also carries the visible controls
 * for ⌘K and ?, the two shortcuts that would otherwise have none.
 *
 * Announced politely rather than hidden: the mode is the reason a key did one
 * thing a moment ago and another now, which a screen reader user needs as
 * much as anyone. The key hints inside it are decorative and marked so.
 */
export function ModeHint({
  mode,
  onOpenPalette,
  onOpenHelp,
}: {
  /** The keys whose meaning depends on state, and what they do right now. */
  mode: { keys: string; text: string }
  onOpenPalette: () => void
  onOpenHelp: () => void
}) {
  return (
    <div className={styles.strip}>
      <p className={styles.mode} aria-live="polite">
        <span className={styles.keys} aria-hidden="true">
          <Kbd keys={mode.keys} />
        </span>
        {mode.text}
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
