import type { Command } from '~/shared/lib/commands'
import { STATUS_LABEL, TASK_STATUSES } from './task.types'
import type { Task, TaskStatus } from './task.types'
import { joinStatus, splitStatus } from './task.search-params'
import type { TaskSearch } from './task.search-params'

/**
 * What every page's registry needs: the ways out of it. Shared by the list
 * and the board, so G I, G T, G B, V, ⌘K and ? mean the same thing everywhere.
 */
export interface NavigationContext {
  view: 'list' | 'board'
  /** Replace the whole search: "go to" means arrive somewhere, not tweak. */
  goTo: (search: TaskSearch) => void
  goToBoard: () => void
  /** V: the other view. */
  toggleView: () => void
  openPalette: () => void
  openHelp: () => void
}

/**
 * What the commands need from the page. Everything is a plain function; the
 * page wires each one to the same mutation or navigation the visible control
 * already uses, so the palette, the shortcut and the button cannot diverge.
 */
export interface TaskCommandContext extends NavigationContext {
  selected: Task | null
  search: TaskSearch
  updateSearch: (patch: Partial<TaskSearch>) => void
  setStatus: (task: Task, status: TaskStatus) => void
  startEdit: (task: Task) => void
  requestDelete: (task: Task) => void
  duplicate: (task: Task) => void
  moveSelection: (delta: 1 | -1) => void
  /** Open the detail panel; and open it with focus on the due date. */
  openTask: (task: Task) => void
  editDue: (task: Task) => void
  /** The design's cascade: close a panel, then clear search, then drop selection. */
  escape: () => void
  focusComposer: () => void
  focusSearch: () => void
}

/**
 * The list's registry, built from the page's current state. A plain function
 * rather than a hook: it just assembles objects, and being pure is what makes
 * the contextual number keys testable without rendering anything.
 *
 * Every key the design draws is bound somewhere now -- the arrows and ⇧→ on
 * the board, the rest here -- except ⌘Z, ⇧⌘Z and ⇧1…3, which are cut
 * (PLAN.md D10, D12), and are absent rather than registered as no-ops.
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
      id: 'open-task',
      label: 'Open the selected task',
      hint: 'Every field, in a panel beside the list',
      keys: '↵',
      group: 'Selected task',
      when: 'selection',
      enabled: has,
      run: onSelected(ctx.openTask),
    },
    {
      id: 'edit-due',
      label: 'Edit the due date',
      keys: 'D',
      group: 'Selected task',
      when: 'selection',
      enabled: has,
      run: onSelected(ctx.editDue),
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

    // ── Navigate / Help ──────────────────────────────────────────────────
    ...navigationCommands(ctx),
  ]
}

/**
 * The ways out of a page, and the two overlays. One implementation, spread
 * into both registries, so the sidebar link, the key and the palette row all
 * agree on where "Board" is.
 */
export function navigationCommands(ctx: NavigationContext): Command[] {
  const onBoard = ctx.view === 'board'
  return [
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
      id: 'go-board',
      label: 'Go to the board',
      hint: onBoard ? 'You are on it' : 'The same tasks, by status',
      keys: 'G B',
      group: 'Navigate',
      enabled: !onBoard,
      run: ctx.goToBoard,
    },
    {
      id: 'toggle-view',
      label: onBoard ? 'Switch to the list' : 'Switch to the board',
      keys: 'V',
      group: 'Navigate',
      run: ctx.toggleView,
    },
    {
      // Hidden from the palette, since it IS the palette; the help overlay
      // lists it like any other key.
      id: 'open-palette',
      label: 'Open the command palette',
      keys: '⌘K',
      group: 'Help',
      hidden: true,
      run: ctx.openPalette,
    },
    {
      id: 'open-help',
      label: 'Show the keyboard map',
      keys: '?',
      group: 'Help',
      run: ctx.openHelp,
    },
  ]
}

function nextStatus(status: TaskStatus): TaskStatus {
  const i = TASK_STATUSES.indexOf(status)
  return TASK_STATUSES[(i + 1) % TASK_STATUSES.length]!
}
