import { useState } from 'react'

/**
 * Which row the keyboard is on.
 *
 * Roving focus, not a fake highlight: moving the selection really moves DOM
 * focus to the row, so a screen reader follows it and the "selected" task is
 * simply the one that has focus. The row is `tabIndex={-1}` -- reachable
 * programmatically, never a Tab stop of its own, so Tab still walks the
 * controls inside it.
 *
 * The selection is derived, not stored, against the current order: a task that
 * was deleted or filtered out simply stops being selected, with no effect to
 * clean it up.
 */
export function useSelection(orderedIds: readonly string[]) {
  const [rawId, setRawId] = useState<string | null>(null)
  const selectedId = rawId !== null && orderedIds.includes(rawId) ? rawId : null

  function focusRow(id: string) {
    // Ids are ObjectId hex or tmp_ prefixes: safe in an attribute selector.
    const row = document.querySelector<HTMLElement>(`[data-task-row="${id}"]`)
    if (!row) return
    row.focus({ preventScroll: true })
    row.scrollIntoView({ block: 'nearest' })
  }

  function move(delta: 1 | -1) {
    if (orderedIds.length === 0) return
    const current = selectedId ? orderedIds.indexOf(selectedId) : -1
    const next =
      current === -1
        ? delta === 1
          ? 0
          : orderedIds.length - 1
        : Math.min(orderedIds.length - 1, Math.max(0, current + delta))
    const id = orderedIds[next]!
    setRawId(id)
    focusRow(id)
  }

  return {
    selectedId,
    /** Selecting from a click or a focus event; no scroll, focus is already there. */
    select: (id: string) => setRawId(id),
    clear: () => setRawId(null),
    move,
    focusRow,
  }
}
