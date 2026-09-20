import { useEffect, useId, useRef, useState } from 'react'
import { Kbd } from '~/shared/components/Kbd'
import { fuzzyScore } from '~/shared/lib/fuzzy'
import type { Command } from '~/shared/lib/commands'
import {
  LISTS,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  listName,
} from '../task.types'
import type { ListId, Priority, Task } from '../task.types'
import styles from './CommandPalette.module.css'

/* The palette is another interface over the registry, not a second
   implementation of anything (PLAN.md 4.5, system design 11). A row here and
   the shortcut for it call the same `run`.

   Accessibility follows the combobox pattern the design names: the input is
   the combobox, the results are a listbox, the highlighted row is announced
   through aria-activedescendant, and FOCUS NEVER LEAVES THE INPUT -- arrows
   move the highlight, not the focus. The native <dialog> owns the backdrop,
   the focus trap and Escape. */

/** Prefix → scope. The design's `@ People` is cut with assignees (D1). */
const SCOPES = [
  { prefix: '', name: 'Everything' },
  { prefix: '>', name: 'Commands' },
  { prefix: '#', name: 'Lists' },
  { prefix: '!', name: 'Priority' },
] as const
type Scope = (typeof SCOPES)[number]['name']

const RECENT_KEY = 'tasker:recent-commands'
const RECENT_MAX = 8
/** How many tasks to show with an empty query, so the list stays scannable. */
const TASKS_UNQUERIED = 6

interface Group {
  /** Reconciliation identity. Never the heading -- headings can collide. */
  key: string
  name: string
  items: Item[]
}

interface Item {
  id: string
  label: string
  hint?: string
  keys?: string
  group: string
  disabled?: boolean
  run: () => void
}

export function CommandPalette({
  commands,
  tasks,
  canSetPriority,
  onSelectTask,
  onFilterList,
  onSetPriority,
  onCreateTask,
  onClose,
}: {
  commands: Command[]
  tasks: Task[]
  /** Priority applies to the selected task; without one the rows are inert. */
  canSetPriority: boolean
  onSelectTask: (id: string) => void
  onFilterList: (listId: ListId) => void
  onSetPriority: (priority: Priority) => void
  onCreateTask: (title: string) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const optionId = (id: string) => `${listId}-${id}`

  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [recent, setRecent] = useState<string[]>(readRecent)

  /* Mounted only while open, so opening is mounting: capture what had focus,
     show the modal, land focus in the input. Unmounting restores focus to the
     trigger -- the design is explicit that Escape returns you to where you
     were. showModal is what makes the page behind it inert. */
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const returnFocusTo = document.activeElement as HTMLElement | null
    dialog.showModal()
    inputRef.current?.focus()
    return () => {
      if (dialog.open) dialog.close()
      /* Restore only if nothing else claimed focus. A command that ran on the
         way out may have put focus somewhere deliberate -- on a task row, say --
         and that must win over "where you were". */
      const active = document.activeElement
      if (!active || active === document.body || dialog.contains(active)) {
        returnFocusTo?.focus()
      }
    }
  }, [])

  // Escape closes a native dialog without telling React; `cancel` keeps
  // component state and DOM state in step.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onCancel = (event: Event) => {
      event.preventDefault()
      onClose()
    }
    dialog.addEventListener('cancel', onCancel)
    return () => dialog.removeEventListener('cancel', onCancel)
  }, [onClose])

  const { scope, term } = parseQuery(query)
  const groups = buildGroups({
    scope,
    term,
    commands,
    tasks,
    recent,
    canSetPriority,
    onSelectTask,
    onFilterList,
    onSetPriority,
  })
  const flat = groups.flatMap((g) => g.items)

  /* Nothing matched but something was typed: the design's fallback row turns
     the search into the task. It is a real option, so Enter runs it and a
     screen reader hears it as the one choice. */
  const fallback: Item | null =
    flat.length === 0 && term.trim() !== ''
      ? {
          id: 'create',
          label: `Create a task called “${term.trim()}”`,
          group: 'Nothing matches',
          run: () => onCreateTask(term.trim()),
        }
      : null
  const options = fallback ? [fallback] : flat

  // The highlight is clamped against the current options rather than reset
  // in an effect: a shrinking result list never leaves it pointing at nothing.
  const active = Math.min(highlight, Math.max(0, options.length - 1))
  const activeItem = options[active]

  function run(item: Item | undefined, keepOpen: boolean) {
    if (!item || item.disabled) return
    if (item.id.startsWith('cmd:')) remember(item.id, recent, setRecent)
    /* The dialog closes before the command runs, not after: while it is modal
       the page behind it is inert, and a command that wants to focus a row
       could not. Unmounting follows on the next commit. */
    if (!keepOpen) dialogRef.current?.close()
    item.run()
    if (!keepOpen) onClose()
  }

  function cycleScope() {
    const i = SCOPES.findIndex((s) => s.name === scope)
    const next = SCOPES[(i + 1) % SCOPES.length]!
    setQuery(
      next.prefix ? `${next.prefix} ${term.trimStart()}` : term.trimStart(),
    )
    setHighlight(0)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setHighlight(options.length === 0 ? 0 : (active + 1) % options.length)
        return
      case 'ArrowUp':
        event.preventDefault()
        setHighlight(
          options.length === 0
            ? 0
            : (active - 1 + options.length) % options.length,
        )
        return
      case 'Home':
        event.preventDefault()
        setHighlight(0)
        return
      case 'End':
        event.preventDefault()
        setHighlight(Math.max(0, options.length - 1))
        return
      case 'Enter':
        event.preventDefault()
        // ⌘↵ runs and keeps the palette open, for stacking several commands.
        run(activeItem, event.metaKey || event.ctrlKey)
        return
      case 'Tab':
        event.preventDefault()
        cycleScope()
        return
      case 'Escape':
        event.preventDefault()
        onClose()
        return
      case 'k':
      case 'K':
        // ⌘K again closes: the key that opened it is a toggle.
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault()
          onClose()
        }
        return
    }
  }

  const resultLabel =
    options.length === 0
      ? 'No results'
      : `${options.length} ${options.length === 1 ? 'result' : 'results'}`

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label="Command palette"
    >
      <div className={styles.panel}>
        <div className={styles.inputRow}>
          <svg
            className={styles.icon}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="m4 17 6-5-6-5M12 19h8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <input
            ref={inputRef}
            className={styles.input}
            role="combobox"
            aria-label="Type a command or search"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={
              activeItem ? optionId(activeItem.id) : undefined
            }
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder="Type a command or search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlight(0)
            }}
            onKeyDown={onKeyDown}
          />
          {/* The count is what a screen reader gets back for each keystroke. */}
          <span className={styles.resultLabel} aria-live="polite">
            {resultLabel}
          </span>
          <span className={styles.escHint}>
            <Kbd keys="esc" />
          </span>
          {/* The sheet's way out. Hidden where Escape exists. */}
          <button
            type="button"
            className={styles.close}
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Buttons, not hints: on a phone there is no ⇥ to cycle them, and on
            a desktop a tap is no worse than a key. Each one rewrites the
            prefix and keeps whatever was typed. */}
        <div className={styles.scopes}>
          {SCOPES.filter((s) => s.prefix).map((s) => (
            <button
              key={s.name}
              type="button"
              className={`${styles.scope} ${scope === s.name ? styles.scopeActive : ''}`}
              aria-pressed={scope === s.name}
              onClick={() => {
                setQuery(scope === s.name ? term : `${s.prefix} ${term}`)
                setHighlight(0)
                inputRef.current?.focus()
              }}
            >
              <span className={styles.scopePrefix} aria-hidden="true">
                {s.prefix}
              </span>{' '}
              {s.name}
            </button>
          ))}
          <span className={styles.scopeHint} aria-hidden="true">
            Fuzzy match, recent-first
          </span>
        </div>

        <ul
          id={listId}
          role="listbox"
          aria-label="Results"
          className={styles.list}
        >
          {fallback ? (
            <li
              role="group"
              aria-label={fallback.group}
              className={styles.group}
            >
              <p className={styles.noMatch}>No match for “{term.trim()}”.</p>
              <ul role="none" className={styles.groupItems}>
                <Option
                  item={fallback}
                  id={optionId(fallback.id)}
                  selected
                  onHover={() => setHighlight(0)}
                  onPick={() => run(fallback, false)}
                />
              </ul>
            </li>
          ) : (
            groups.map((group) => (
              <li
                key={group.key}
                role="group"
                aria-label={group.name}
                className={styles.group}
              >
                <p className={styles.groupLabel} aria-hidden="true">
                  {group.name}
                </p>
                <ul role="none" className={styles.groupItems}>
                  {group.items.map((item) => {
                    const index = options.indexOf(item)
                    return (
                      <Option
                        key={item.id}
                        item={item}
                        id={optionId(item.id)}
                        selected={index === active}
                        onHover={() => setHighlight(index)}
                        onPick={() => run(item, false)}
                      />
                    )
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>

        <div className={styles.footer} aria-hidden="true">
          <span>
            <Kbd keys="↑ ↓" /> navigate
          </span>
          <span>
            <Kbd keys="↵" /> run
          </span>
          <span>
            <Kbd keys="⌘↵" /> run and keep open
          </span>
          <span>
            <Kbd keys="⇥" /> scope
          </span>
        </div>
      </div>
    </dialog>
  )
}

function Option({
  item,
  id,
  selected,
  onHover,
  onPick,
}: {
  item: Item
  id: string
  selected: boolean
  onHover: () => void
  onPick: () => void
}) {
  const ref = useRef<HTMLLIElement>(null)
  // Keeps the highlighted row in view as the arrows walk past the fold.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <li
      ref={ref}
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={item.disabled || undefined}
      className={`${styles.option} ${selected ? styles.optionActive : ''} ${
        item.disabled ? styles.optionDisabled : ''
      }`}
      onMouseMove={onHover}
      // mousedown, and prevented: a click must never move focus out of the
      // input, or the combobox stops being one.
      onMouseDown={(e) => {
        e.preventDefault()
        onPick()
      }}
    >
      <span className={styles.optionText}>
        <span className={styles.optionLabel}>{item.label}</span>
        {item.hint && <span className={styles.optionHint}>{item.hint}</span>}
      </span>
      {item.keys && <Kbd keys={item.keys} />}
    </li>
  )
}

function parseQuery(query: string): { scope: Scope; term: string } {
  const first = query[0]
  const match = SCOPES.find((s) => s.prefix && s.prefix === first)
  if (match) return { scope: match.name, term: query.slice(1).trimStart() }
  return { scope: 'Everything', term: query }
}

function buildGroups(args: {
  scope: Scope
  term: string
  commands: Command[]
  tasks: Task[]
  recent: string[]
  canSetPriority: boolean
  onSelectTask: (id: string) => void
  onFilterList: (listId: ListId) => void
  onSetPriority: (priority: Priority) => void
}): Group[] {
  const { scope, term } = args
  const groups: Group[] = []

  if (scope === 'Everything' || scope === 'Commands') {
    const items: Item[] = args.commands
      .filter((c) => !c.hidden)
      .map((c) => ({
        id: `cmd:${c.id}`,
        label: c.label,
        hint: c.enabled === false ? 'Select a task first' : c.hint,
        keys: c.keys,
        group: c.group,
        disabled: c.enabled === false,
        run: c.run,
      }))
    for (const group of rank(items, term, args.recent)) groups.push(group)
  }

  if (scope === 'Everything' || scope === 'Commands') {
    // Tasks ride along with commands, so one box searches both, but a bare
    // open shows only a handful: the full list is already on the page.
    const matched = args.tasks
      .map((t) => ({ t, score: fuzzyScore(term, t.title) }))
      .filter((x): x is { t: Task; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.t)
    const shown =
      term.trim() === '' ? matched.slice(0, TASKS_UNQUERIED) : matched
    if (shown.length > 0 && scope === 'Everything') {
      groups.push({
        key: 'tasks',
        // Not just "Tasks": the registry has a command group by that name, and
        // two headings reading the same thing is a worse list, not a shorter one.
        name: 'Matching tasks',
        items: shown.map((t) => ({
          id: `task:${t.id}`,
          label: t.title,
          hint: [STATUS_LABEL[t.status], listName(t.listId)]
            .filter(Boolean)
            .join(' · '),
          group: 'Tasks',
          run: () => args.onSelectTask(t.id),
        })),
      })
    }
  }

  if (scope === 'Lists') {
    const items = LISTS.filter((l) => fuzzyScore(term, l.name) !== null).map(
      (l): Item => ({
        id: `list:${l.id}`,
        label: l.name,
        hint: 'Show only this list',
        group: 'Lists',
        run: () => args.onFilterList(l.id),
      }),
    )
    if (items.length) groups.push({ key: 'lists', name: 'Lists', items })
  }

  if (scope === 'Priority') {
    const items = PRIORITIES.filter(
      (p) => fuzzyScore(term, PRIORITY_LABEL[p]) !== null,
    ).map((p): Item => ({
      id: `priority:${p}`,
      label: PRIORITY_LABEL[p],
      hint: args.canSetPriority
        ? 'Set on the selected task'
        : 'Select a task first',
      group: 'Priority',
      disabled: !args.canSetPriority,
      run: () => args.onSetPriority(p),
    }))
    if (items.length) groups.push({ key: 'priority', name: 'Priority', items })
  }

  return groups
}

/**
 * Commands, matched and ordered. With a term: by score, recent breaking ties.
 * Without one: recent first, then the registry's own order, grouped as the
 * registry groups them.
 */
function rank(items: Item[], term: string, recent: string[]): Group[] {
  const recency = (item: Item) => {
    const i = recent.indexOf(item.id)
    return i === -1 ? Number.POSITIVE_INFINITY : i
  }

  let ordered: Item[]
  if (term.trim() === '') {
    ordered = [...items].sort((a, b) => recency(a) - recency(b))
  } else {
    ordered = items
      .map((item) => ({ item, score: fuzzyScore(term, item.label) }))
      .filter((x): x is { item: Item; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score || recency(a.item) - recency(b.item))
      .map((x) => x.item)
  }

  // Recently used ones surface in their own group, as the design draws it.
  const recentItems =
    term.trim() === ''
      ? ordered.filter((i) => recency(i) !== Number.POSITIVE_INFINITY)
      : []
  const rest = ordered.filter((i) => !recentItems.includes(i))

  const groups: Group[] = []
  if (recentItems.length)
    groups.push({ key: 'recent', name: 'Recent', items: recentItems })
  const byGroup = new Map<string, Item[]>()
  for (const item of rest) {
    const list = byGroup.get(item.group)
    if (list) list.push(item)
    else byGroup.set(item.group, [item])
  }
  for (const [name, list] of byGroup)
    groups.push({ key: `cmd:${name}`, name, items: list })
  return groups
}

/* Recent-first, remembered for the session. sessionStorage rather than
   localStorage on purpose: what you reached for today is a good guess for the
   next hour, not for next month. Guarded because storage can be absent or
   throwing in private windows, and the palette must open regardless. */
function readRecent(): string[] {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : []
  } catch {
    return []
  }
}

function remember(
  id: string,
  recent: string[],
  setRecent: (r: string[]) => void,
) {
  const next = [id, ...recent.filter((r) => r !== id)].slice(0, RECENT_MAX)
  setRecent(next)
  try {
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: the ordering is a convenience, not a requirement.
  }
}
