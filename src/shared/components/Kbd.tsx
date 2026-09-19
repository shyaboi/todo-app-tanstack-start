import { usePlatform, resolveKeys } from '../hooks/usePlatform'
import styles from './Kbd.module.css'

/* Accepts the design's Mac glyphs verbatim ("⌘K", "⇧→") and resolves them for
   the running platform, so the key map can be transcribed as drawn. */
export function Kbd({ keys }: { keys: string }) {
  const platform = usePlatform()
  const resolved = resolveKeys(keys, platform)

  // "G I" is a sequence, "⌘K" is a chord: split on spaces, keep chords whole.
  const parts = resolved.split(' ').filter(Boolean)

  return (
    <span className={styles.group}>
      {parts.map((part, i) => (
        <kbd className={styles.kbd} key={`${part}-${i}`}>
          {part}
        </kbd>
      ))}
    </span>
  )
}
