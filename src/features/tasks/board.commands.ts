import type { Command } from '~/shared/lib/commands'
import { STATUS_LABEL, TASK_STATUSES, nextStatus } from './task.types'
import type { Task, TaskStatus } from './task.types'
import { navigationCommands } from './task.commands'
import type { NavigationContext } from './task.commands'

/**
 * What the board's commands need from the page. The same shape of contract as
 * the list's: plain functions, wired by the page to the one mutation or
 * navigation the visible control already uses.
 */
export interface BoardCommandContext extends NavigationContext {
  selected: Task | null
  /** Whether the selected card is picked up (Space) and riding the arrows. */
  lifted: boolean
  moveSelection: (delta: 1 | -1) => void
  moveColumn: (delta: 1 | -1) => void
  /** Change the selected card's status; the board keeps it selected. */
  setStatus: (task: Task, status: TaskStatus) => void
  toggleLift: () => void
  openTask: (task: Task) => void
  escape: () => void
}

/* Column order is status order: To do → In progress → Done. */
const COLUMN_INDEX: Record<TaskStatus, number> = { todo: 0, doing: 1, done: 2 }

function adjacentStatus(status: TaskStatus, delta: 1 | -1): TaskStatus | null {
  const next = COLUMN_INDEX[status] + delta
  return TASK_STATUSES[next] ?? null
}

/**
 * The board's registry (PLAN.md 6.4, D11). Keyboard movement is the
 * contract; pointer drag-and-drop, when it lands, dispatches into these same
 * functions rather than into a second implementation.
 */
export function buildBoardCommands(ctx: BoardCommandContext): Command[] {
  const { selected, lifted } = ctx
  const has = selected !== null
  const onSelected = (fn: (task: Task) => void) => () => {
    if (selected) fn(selected)
  }
  const left = selected ? adjacentStatus(selected.status, -1) : null
  const right = selected ? adjacentStatus(selected.status, 1) : null

  return [
    // ── Selected task ────────────────────────────────────────────────────
    {
      id: 'board-up',
      label: 'Move the selection up',
      keys: '↑',
      group: 'Selected task',
      hidden: true,
      run: () => ctx.moveSelection(-1),
    },
    {
      id: 'board-down',
      label: 'Move the selection down',
      keys: '↓',
      group: 'Selected task',
      hidden: true,
      run: () => ctx.moveSelection(1),
    },
    {
      /* ← and → are the one pair whose meaning changes with Space: they walk
         columns, or they carry the lifted card between them. One binding,
         one label that says which, so the help overlay never lies. */
      id: 'board-left',
      label: lifted
        ? 'Carry the card to the previous column'
        : 'Previous column',
      keys: '←',
      group: 'Selected task',
      hidden: true,
      run: () => {
        if (lifted && selected && left) ctx.setStatus(selected, left)
        else if (!lifted) ctx.moveColumn(-1)
      },
    },
    {
      id: 'board-right',
      label: lifted ? 'Carry the card to the next column' : 'Next column',
      keys: '→',
      group: 'Selected task',
      hidden: true,
      run: () => {
        if (lifted && selected && right) ctx.setStatus(selected, right)
        else if (!lifted) ctx.moveColumn(1)
      },
    },
    {
      id: 'board-advance',
      label: 'Move the card to the next status',
      hint: right ? `→ ${STATUS_LABEL[right]}` : 'Already done',
      keys: '⇧→',
      group: 'Selected task',
      when: 'selection',
      enabled: has && right !== null,
      run: onSelected((task) => {
        const to = adjacentStatus(task.status, 1) ?? nextStatus(task.status)
        ctx.setStatus(task, to)
      }),
    },
    {
      id: 'board-retreat',
      label: 'Move the card to the previous status',
      hint: left ? `→ ${STATUS_LABEL[left]}` : 'Already at To do',
      keys: '⇧←',
      group: 'Selected task',
      when: 'selection',
      enabled: has && left !== null,
      run: onSelected((task) => {
        const to = adjacentStatus(task.status, -1)
        if (to) ctx.setStatus(task, to)
      }),
    },
    {
      id: 'board-lift',
      label: lifted ? 'Drop the card' : 'Pick the card up',
      hint: lifted ? 'Or press Escape to leave it' : 'Then ← → carry it',
      keys: 'Space',
      group: 'Selected task',
      when: 'selection',
      enabled: has,
      run: ctx.toggleLift,
    },
    {
      id: 'board-open',
      label: 'Open the selected task',
      keys: '↵',
      group: 'Selected task',
      when: 'selection',
      enabled: has,
      run: onSelected(ctx.openTask),
    },
    {
      id: 'board-escape',
      label: 'Drop the card, or clear the selection',
      keys: 'esc',
      group: 'Selected task',
      hidden: true,
      run: ctx.escape,
    },

    // ── Navigate / Help ──────────────────────────────────────────────────
    ...navigationCommands(ctx),
  ]
}
