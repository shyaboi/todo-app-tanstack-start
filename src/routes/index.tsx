import { createFileRoute, Link } from '@tanstack/react-router'
import styles from './index.module.css'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Tasker</h1>
      <p className={styles.lede}>
        The foundations are in place. The task list arrives in Sprint 1,
        loader-backed and server-rendered.
      </p>
      <Link to="/dev/components" className={styles.link}>
        Component inventory →
      </Link>
    </main>
  )
}
