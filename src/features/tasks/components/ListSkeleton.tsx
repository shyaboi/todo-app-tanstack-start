import { Skeleton } from '~/shared/components/Skeleton'
import styles from './ListSkeleton.module.css'

/**
 * The shape of the page, while its data is on the way (PLAN.md 7.1).
 *
 * Geometry matches the real thing -- sidebar width, composer height, row
 * height and padding -- so nothing shifts when content arrives. When it is
 * shown is the route's decision: after 200ms, and not for less than a moment,
 * so a fast load never flashes it and a slow one never flickers it.
 *
 * One announcement for the whole thing; the bars are decoration.
 */
export function ListSkeleton() {
  return (
    <div
      className={styles.shell}
      role="status"
      aria-label="Loading your tasks"
      aria-busy="true"
    >
      <div className={styles.sidebar} aria-hidden="true">
        <Skeleton width={96} height={26} />
        <div className={styles.navGroup}>
          <Skeleton width="80%" height={18} />
          <Skeleton width="70%" height={18} />
          <Skeleton width="60%" height={18} />
        </div>
        <div className={styles.navGroup}>
          <Skeleton width="65%" height={18} />
          <Skeleton width="55%" height={18} />
          <Skeleton width="60%" height={18} />
          <Skeleton width="50%" height={18} />
        </div>
      </div>

      <div className={styles.content} aria-hidden="true">
        <Skeleton width={140} height={40} />
        <div className={styles.composer}>
          <Skeleton width="45%" height={18} />
        </div>
        <ul className={styles.rows}>
          {ROW_WIDTHS.map((width, i) => (
            <li key={i} className={styles.row}>
              <Skeleton width={18} height={18} radius="4px" />
              <Skeleton width={width} height={16} />
              <span className={styles.meta}>
                <Skeleton width={44} height={14} radius="999px" />
                <Skeleton width={72} height={22} radius="999px" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* Varied on purpose: identical bars read as a table, not as titles. */
const ROW_WIDTHS = ['52%', '38%', '61%', '44%', '57%', '35%'] as const
