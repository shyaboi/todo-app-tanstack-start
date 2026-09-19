import { createFileRoute } from '@tanstack/react-router'

import { Button } from '~/shared/components/Button'
import { Field } from '~/shared/components/Field'
import { StatusPill, PriorityPill, Chip } from '~/shared/components/Pill'
import { Kbd } from '~/shared/components/Kbd'
import { Skeleton } from '~/shared/components/Skeleton'
import styles from './dev.components.module.css'

/* A live inventory of the component system, mirroring the Component Inventory
   screen of the FE design. It exists so a change to a token can be seen across
   every control at once, rather than discovered later in one corner of the app.
   Note: the plan called this /_dev/components; a leading underscore denotes a
   pathless layout in TanStack Router, so the path is /dev/components. */
export const Route = createFileRoute('/dev/components')({
  component: Inventory,
  head: () => ({ meta: [{ title: 'Components · Tasker' }] }),
})

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{title}</h2>
      {note && <p className={styles.note}>{note}</p>}
      <div className={styles.row}>{children}</div>
    </section>
  )
}

function Inventory() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Components</h1>
        <p className={styles.lede}>
          Every control the seven acceptance criteria need — and nothing else.
        </p>
      </header>

      <Section
        title="Buttons"
        note="Every button is a real <button>; icon-only ones carry an aria-label. 44px is the default height so the same markup works on touch."
      >
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
        <Button variant="primary" loading>
          Save
        </Button>
        <Button variant="secondary" size="small">
          Small
        </Button>
        <Button variant="ghost" iconOnly aria-label="Delete task">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
      </Section>

      <Section title="Fields">
        <div className={styles.stack}>
          <Field label="Title" placeholder="Add a task…" required />
          <Field
            label="Search"
            type="search"
            placeholder="Search tasks"
            description="Matches title, notes and list name."
          />
          <Field label="Title" defaultValue="" error="Title is required" />
          <Field label="Notes" multiline placeholder="Markdown supported" />
        </div>
      </Section>

      <Section
        title="Pills & chips"
        note="Status is never colour alone: every pill carries its label."
      >
        <StatusPill status="todo" />
        <StatusPill status="doing" />
        <StatusPill status="done" />
        <PriorityPill priority="p1" />
        <PriorityPill priority="p2" />
        <PriorityPill priority="p3" />
        <Chip>Ship v1</Chip>
        <Chip variant="outline">Due this week</Chip>
      </Section>

      <Section
        title="Keys"
        note="Mac glyphs are resolved per platform, not hard-coded — on Windows and Linux ⌘ reads as Ctrl."
      >
        <Kbd keys="⌘K" />
        <Kbd keys="N" />
        <Kbd keys="/" />
        <Kbd keys="↵" />
        <Kbd keys="esc" />
        <Kbd keys="⌘⌫" />
        <Kbd keys="G I" />
        <Kbd keys="⇧→" />
      </Section>

      <Section
        title="Skeleton"
        note="Matches real row geometry exactly, so nothing shifts on arrival."
      >
        <div className={styles.stack}>
          <div className={styles.skelRow}>
            <Skeleton width={18} height={18} radius="4px" />
            <Skeleton width="42%" />
            <Skeleton width={64} height={12} />
          </div>
          <div className={styles.skelRow}>
            <Skeleton width={18} height={18} radius="4px" />
            <Skeleton width="28%" />
            <Skeleton width={64} height={12} />
          </div>
        </div>
      </Section>

      <Section title="Type scale">
        <div className={styles.stack}>
          <p className={styles.display}>Nothing here yet</p>
          <p className={styles.title1}>Later this week</p>
          <p className={styles.title2}>Wire optimistic updates</p>
          <p className={styles.body}>
            Apply the mutation to the cache first, then reconcile.
          </p>
          <p className={styles.small}>3 tasks match · sorted by relevance</p>
          <p className={styles.mono}>TSK-118 · status=doing</p>
        </div>
      </Section>
    </main>
  )
}
