import { Fragment } from 'react'
import { usePlatform } from '../hooks/usePlatform'
import { displayKeys } from '../lib/keys'
import styles from './Kbd.module.css'

/**
 * Accepts the design's Mac glyphs verbatim ("⌘K", "⇧→", "G I") and resolves
 * them for the running platform, so the key map can be transcribed as drawn.
 *
 * On a Mac a chord is one keycap: ⌘K. Elsewhere it is spelled out and each
 * part gets its own keycap joined by a plus: Ctrl + K. A sequence ("G I") is
 * separate keycaps with a gap, on every platform.
 */
export function Kbd({ keys }: { keys: string }) {
  const platform = usePlatform()
  const tokens = displayKeys(keys, platform).split(' ').filter(Boolean)

  return (
    <span className={styles.group}>
      {tokens.map((token, ti) => (
        <Fragment key={`${token}-${ti}`}>
          {ti > 0 && <span className={styles.gap} aria-hidden="true" />}
          {token.split('+').map((key, ki) => (
            <Fragment key={`${key}-${ki}`}>
              {ki > 0 && (
                <span className={styles.plus} aria-hidden="true">
                  +
                </span>
              )}
              <kbd className={styles.kbd}>{key}</kbd>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  )
}
