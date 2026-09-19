import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main>
      <h1>Tasker</h1>
      <p>
        Scaffold is live. The task list arrives in Sprint 1, loader-backed and
        server-rendered.
      </p>
    </main>
  )
}
