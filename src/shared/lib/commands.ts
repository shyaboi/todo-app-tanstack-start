/* The command registry (PLAN.md 4.5). One implementation per behaviour: the
   shortcut, the palette row and the visible button all dispatch into the same
   `run`, so adding a command in one place makes it reachable from all three,
   and there is never a "palette version" of delete that drifts from the
   button's. */

export type CommandGroup =
  'Tasks' | 'Selected task' | 'Navigate' | 'Filters & views' | 'Help'

export interface Command {
  id: string
  /** What the palette shows and matches on. */
  label: string
  /** Under the label in the palette, and in the help overlay. */
  hint?: string
  /** In the design's notation: '⌘K', 'G I', '⇧⌘X'. Absent means palette-only. */
  keys?: string
  group: CommandGroup
  /**
   * Number keys are contextual (design rule 02): with a row selected they set
   * its status; with nothing selected they filter the list. Two commands share
   * a key and `when` decides which one is live.
   */
  when?: 'always' | 'selection' | 'no-selection'
  /** Listed but not runnable right now -- e.g. needs a selection. */
  enabled?: boolean
  /** Bound to a key but not listed in the palette: ↑↓, Escape. */
  hidden?: boolean
  run: () => void
}

export function isLive(command: Command, hasSelection: boolean): boolean {
  if (command.enabled === false) return false
  const when = command.when ?? 'always'
  if (when === 'selection') return hasSelection
  if (when === 'no-selection') return !hasSelection
  return true
}
