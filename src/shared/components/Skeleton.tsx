import styles from './Skeleton.module.css'

export function Skeleton({
  width = '100%',
  height = 14,
  radius,
}: {
  width?: string | number
  height?: string | number
  radius?: string
}) {
  return (
    <span
      className={styles.skeleton}
      style={{ width, height, borderRadius: radius, display: 'block' }}
      // The loading state is announced once at the container level; a dozen
      // shimmering bars have nothing individually useful to say.
      aria-hidden="true"
    />
  )
}
