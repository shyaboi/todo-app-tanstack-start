import type { Command } from '~/shared/lib/commands'
import { STATUS_LABEL, TASK_STATUSES } from './task.types'
import type { Task, TaskStatus } from './task.types'
import { joinStatus, splitStatus } from './task.search-params'
import type { TaskSearch } from './task.search-params'

/**
 * What the commands need from the page. Everything is a plain function; the
 * page wires each one to the same mutation or navigation the visible control
 * already uses, so the palette, the shortcut and the button cannot diverge.
 */
export interface TaskCommandContext {
  selected: Task | null
  search: TaskSearch
  updateSearch: (patch: Partial<TaskSearch>) => void
  /** Replace the whole search: "go to" means arrive somewhere, not tweak. */
  goTo: (search: TaskSearch) => void
  setStatus: (task: Task, status: TaskStatus) => void
  startEdit: (task: Task) => void
  requestDelete: (task: Task) => void
  duplicate: (task: Task) => void
  moveSelection: (delta: 1 | -1) => void
  /** The design's cascade: close a panel, then clear search, then drop selection. */
  escape: () => void
  focusComposer: () => void
  focusSearch: () => void
}

/**
 * The registry, built from the page's current state. A plain function rather
 * than a hook: it just assembles objects, and being pure is what makes the
 * contextual number keys testable without rendering anything.
 *
 * Bindings the design lists but that have no home yet are deliberately not
 * registered rather than registered as no-ops: ← → ⇧→ G B and V belong to the
 * board (Sprint 6), D to due-date editing (Sprint 6). ⌘Z, ⇧⌘Z and ⇧1…3 are
 * cut (PLAN.md D10, D12).
 */
export function buildTaskCommands(ctx: TaskCommandContext): Command[] {
  const { selected } = ctx
  const has = selected !== null
  const onSelected = (fn: (task: Task) => void) => () => {
    if (selected) fn(selected)
  }

  const statuses = splitStatus(ctx.search.status)
  const hidingCompleted = statuses.length > 0 && !statuses.includes('done')

  return [
    // ── Tasks ────────────────────────────────────────────────────────────
    {
      id: 'new-task',
      label: 'New task',
      hint: 'Start typing in the composer',
      keys: 'N',
      group: 'Tasks',
      run: ctx.focusComposer,
    },
    {
      id: 'focus-search',
      label: 'Focus the search field',
      keys: '/',
      group: 'Tasks',
      run: ctx.focusSearch,
    },

    // ── Selected task ────────────────────────────────────────────────────
    {
      id: 'advance-status',
      label: 'Advance status',
      hint: 'To do → In progress → Done',
      keys: 'Space',
      group: 'Selected task',
      when: 'selection',
      enabled: has,
      run: onSelected((task) => ctx.setStatus(task, nextStatus(task.status))),
    },
    ...TASK_STATUSES.map((status, i): Command => ({
      id: `set-status-${status}`,
      label: `Set status: ${STATUS_LABEL[status]}`,
      keys: String(i + 1),
      group: 'Selected task',
      when: 'selection',
      enabled: has,
      run: onSelected((task) => ctx.setStatus(task, status)),
    })),
    {
      id: 'edit-title',
      label: 'Edit the title in place',
      keys: 'E',
      group: 'Selected task',
      when: 'selection',
      enabled: has,
      run: onSelected(ctx.startEdit),
    },
    {
      // The design's ↵ opens the detail panel, which arrives with Sprint 6.
      // Until then it is the same as E, and hidden so it is not listed twice.
      id: 'open-task',
      label: 'Open the selected task',
      keys: '↵',
      group: 'Selected task',
      when: 'selection',
      enabled: has,
      hidden: true,
      run: onSelected(ctx.startEdit),
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      hint: 'A copy, back at To do',
      keys: '⌘D',
      group: 'Selected task',
      when: 'selection',
      enabled: has,
      run: onSelected(ctx.duplicate),
    },
    {
      id: 'delete',
      label: 'Delete',
      hint: 'With an 8-second undo',
      keys: '⌘⌫',
      group: 'Selected task',
      when: 'selection',
      enabled: has,
      run: onSelected(ctx.requestDelete),
    },

    // ── Navigate ─────────────────────────────────────────────────────────
    {
      id: 'select-next',
      label: 'Move the selection down',
      keys: '↓',
      group: 'Navigate',
      hidden: true,
      run: () => ctx.moveSelection(1),
    },
    {
      id: 'select-previous',
      label: 'Move the selection up',
      keys: '↑',
      group: 'Navigate',
      hidden: true,
      run: () => ctx.moveSelection(-1),
    },
    {
      id: 'go-inbox',
      label: 'Go to Inbox',
      hint: 'Everything, unfiltered',
      keys: 'G I',
      group: 'Navigate',
      run: () => ctx.goTo({}),
    },
    {
      id: 'go-today',
      label: 'Go to Today',
      keys: 'G T',
      group: 'Navigate',
      run: () => ctx.goTo({ due: 'today' }),
    },
    {
      id: 'escape',
      label: 'Close, clear, or drop the selection',
      keys: 'esc',
      group: 'Navigate',
      hidden: true,
      run: ctx.escape,
    },

    // ── Filters & views ──────────────────────────────────────────────────
    /* The same three keys as "set status", live only when nothing is selected
       (design rule 02). Pressing the active one again clears it. */
    ...TASK_STATUSES.map((status, i): Command => ({
      id: `filter-${status}`,
      label: `Filter by ${STATUS_LABEL[status]}`,
      keys: String(i + 1),
      group: 'Filters & views',
      when: 'no-selection',
      run: () =>
        ctx.updateSearch({
          status:
            statuses.length === 1 && statuses[0] === status
              ? undefined
              : status,
        }),
    })),
    {
      id: 'show-all',
      label: 'Show all statuses',
      keys: 'A',
      group: 'Filters & views',
      run: () => ctx.updateSearch({ status: undefined }),
    },
    {
      id: 'toggle-completed',
      label: hidingCompleted ? 'Show completed tasks' : 'Hide completed tasks',
      keys: '⇧C',
      group: 'Filters & views',
      run: () =>
        ctx.updateSearch({
          status: hidingCompleted ? undefined : joinStatus(['todo', 'doing']),
        }),
    },
    {
      id: 'clear-filters',
      label: 'Clear every filter and the query',
      keys: '⇧⌘X',
      group: 'Filters & views',
      run: () => ctx.goTo({ sort: ctx.search.sort }),
    },
  ]
}

function nextStatus(status: TaskStatus): TaskStatus {
  const i = TASK_STATUSES.indexOf(status)
  return TASK_STATUSES[(i + 1) % TASK_STATUSES.length]!
}
