import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { KeyboardMap } from '~/shared/components/KeyboardMap'
import { useShortcuts } from '~/shared/hooks/useShortcuts'
import {
  tasksQuery,
  useCreateTask,
  useUpdateTask,
} from '~/features/tasks/task.query'
import { STATUS_LABEL, TASK_STATUSES } from '~/features/tasks/task.types'
import type { Task, TaskStatus } from '~/features/tasks/task.types'
import { buildBoardCommands } from '~/features/tasks/board.commands'
import { rememberView } from '~/features/tasks/task.lastView'
import { Board, toColumns } from '~/features/tasks/components/Board'
import type { BoardControls } from '~/features/tasks/components/Board'
import { CommandPalette } from '~/features/tasks/components/CommandPalette'
import { ModeHint } from '~/features/tasks/components/ModeHint'
import { BottomNav } from '~/features/tasks/components/BottomNav'
import styles from './_shell.board.module.css'

/* /board: the same tasks as the list, laid out by status (PLAN.md 4.2, D5).
   No search params of its own -- the board shows everything, and the list is
   where filtering lives. Data comes from the shell's loader, so arriving here
   from the list is free. */
export const Route = createFileRoute('/_shell/board')({
  component: BoardPage,
})

function BoardPage() {
  const { data: tasks = [] } = useQuery(tasksQuery)
  const navigate = useNavigate()
  const columns = toColumns(tasks)

  /* Selection is one card, derived against the current tasks so a card that
     vanished simply stops being selected. Lifted is a mode: while a card is
     picked up the arrows carry it instead of moving the selection. */
  const [rawId, setRawId] = useState<string | null>(null)
  const [lifted, setLifted] = useState(false)
  const selected = tasks.find((t) => t.id === rawId) ?? null
  const selectedId = selected?.id ?? null
  const liftedId = lifted && selected ? selected.id : null
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // What the last move did, for the live region -- the visual is not enough.
  const [announcement, setAnnouncement] = useState('')
  // The card under the pointer, while one is being dragged.
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // This is now the view a bare visit should land on (D5).
  useEffect(() => {
    rememberView('board')
  }, [])

  const update = useUpdateTask(selectedId ?? 'none')
  const create = useCreateTask()

  function focusCard(id: string) {
    const card = document.querySelector<HTMLElement>(`[data-task-card="${id}"]`)
    card?.focus({ preventScroll: true })
    card?.scrollIntoView({ block: 'nearest' })
  }

  function select(id: string) {
    setRawId(id)
    focusCard(id)
  }

  /* ↑↓ within the column; from nothing, the first card of the first column
     that has one. */
  function moveSelection(delta: 1 | -1) {
    if (!selected) {
      const first = columns.find((c) => c.tasks.length > 0)?.tasks[0]
      if (first) select(first.id)
      return
    }
    const column = columns.find((c) => c.status === selected.status)!
    const i = column.tasks.findIndex((t) => t.id === selected.id)
    const next =
      column.tasks[Math.min(column.tasks.length - 1, Math.max(0, i + delta))]
    if (next) select(next.id)
  }

  /* ←→ to the neighbouring column, keeping the row where it can. An empty
     column is skipped rather than landing the selection on nothing. */
  function moveColumn(delta: 1 | -1) {
    if (!selected) {
      moveSelection(1)
      return
    }
    const from = TASK_STATUSES.indexOf(selected.status)
    const row = columns[from]!.tasks.findIndex((t) => t.id === selected.id)
    for (let i = from + delta; i >= 0 && i < columns.length; i += delta) {
      const column = columns[i]!
      const target = column.tasks[Math.min(row, column.tasks.length - 1)]
      if (target) {
        select(target.id)
        return
      }
    }
  }

  /* Focus follows a moved card into its new column. The card is a new
     element there -- a different <ul> -- and it only exists once the
     optimistic write has re-rendered, which is after the mutation's async
     onMutate, not on the next frame. So the move is recorded as state and
     honoured by the effect below on whichever commit first shows the card
     under the column it was sent to; the ref only remembers which move has
     already been followed, so a later render does not drag focus back. */
  const [lastMove, setLastMove] = useState<{
    id: string
    status: TaskStatus
  } | null>(null)
  const followed = useRef<typeof lastMove>(null)
  useEffect(() => {
    if (!lastMove || followed.current === lastMove) return
    const card = document.querySelector<HTMLElement>(
      `[data-board-column="${lastMove.status}"] [data-task-card="${lastMove.id}"]`,
    )
    if (!card) return
    followed.current = lastMove
    card.focus({ preventScroll: true })
    card.scrollIntoView({ block: 'nearest' })
  })

  function setStatus(task: Task, status: TaskStatus) {
    if (task.status === status) return
    setLastMove({ id: task.id, status })
    update.mutate({ id: task.id, patch: { status } })
    setAnnouncement(`Moved "${task.title}" to ${STATUS_LABEL[status]}`)
  }

  function openTask(task: Task) {
    void navigate({ to: '/t/$todoId', params: { todoId: task.id } })
  }

  const commands = buildBoardCommands({
    view: 'board',
    selected,
    lifted,
    moveSelection,
    moveColumn,
    setStatus,
    toggleLift: () => {
      if (!selected) return
      setLifted((l) => !l)
      setAnnouncement(
        lifted
          ? `Dropped "${selected.title}"`
          : `Picked up "${selected.title}". Use the arrows to carry it.`,
      )
    },
    openTask,
    escape: () => {
      if (lifted) {
        setLifted(false)
        setAnnouncement(`Dropped "${selected?.title ?? 'the card'}"`)
      } else if (selected) {
        setRawId(null)
        const active = document.activeElement
        if (
          active instanceof HTMLElement &&
          active.closest('[data-task-card]')
        ) {
          active.blur()
        }
      }
    },
    goTo: (search) => void navigate({ to: '/', search }),
    goToBoard: () => {},
    toggleView: () => void navigate({ to: '/', search: {} }),
    openPalette: () => setPaletteOpen(true),
    openHelp: () => setHelpOpen(true),
  })
  useShortcuts(commands, selected !== null)

  const controls: BoardControls = {
    selectedId,
    liftedId,
    draggingId,
    onSelect: (id) => setRawId(id),
    onOpen: openTask,
    onToggleLift: (task) => {
      setRawId(task.id)
      setLifted((l) => !(l && liftedId === task.id))
    },
    /* The pointer path (6.5). A drag selects the card and puts down anything
       the keyboard had picked up; a drop is exactly the status change ⇧→
       makes, through the same function, announced the same way. */
    onDragStart: (task) => {
      setRawId(task.id)
      setLifted(false)
      setDraggingId(task.id)
    },
    onDragEnd: () => setDraggingId(null),
    onDrop: (taskId, status) => {
      setDraggingId(null)
      const task = tasks.find((t) => t.id === taskId)
      if (task) setStatus(task, status)
    },
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Board</h1>
        <p className={styles.count}>
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
        </p>
      </header>

      {/* Announced politely: where the card went is the answer to the key. */}
      <p
        className="visually-hidden"
        aria-live="polite"
        data-testid="board-announcement"
      >
        {announcement}
      </p>

      {tasks.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing on the board yet</p>
          <p className={styles.emptyBody}>
            Add a task from the list and it appears here under its status.
          </p>
        </div>
      ) : (
        <Board columns={columns} controls={controls} />
      )}

      <BottomNav onActions={() => setPaletteOpen(true)} />

      <ModeHint
        mode={
          lifted
            ? { keys: '← →', text: 'carry the picked-up card' }
            : selected
              ? { keys: '← →', text: 'move between columns' }
              : { keys: '↑ ↓', text: 'select a card' }
        }
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
      />

      {helpOpen && (
        <KeyboardMap
          commands={commands}
          hasSelection={selected !== null}
          onClose={() => setHelpOpen(false)}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          commands={commands}
          tasks={tasks}
          canSetPriority={selected !== null}
          onSelectTask={(id) =>
            void navigate({ to: '/t/$todoId', params: { todoId: id } })
          }
          onFilterList={(listId) =>
            void navigate({ to: '/', search: { list: listId } })
          }
          onSetPriority={(priority) => {
            if (selected) {
              update.mutate({ id: selected.id, patch: { priority } })
            }
          }}
          onCreateTask={(title) => create.mutate({ title })}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </main>
  )
}
