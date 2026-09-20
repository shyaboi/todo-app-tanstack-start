import type { Platform } from '../hooks/usePlatform'

/* The key map is written in the design's own notation -- "⌘K", "⇧⌘X", "G I" --
   and parsed here, so the registry reads exactly as the Keyboard Map screen
   does and there is no second spelling to drift from it.

   A spec is one or more STEPS separated by spaces. "⌘K" is one step; "G I" is
   a two-step chord (press G, then I). "1 2 3" in the design is three separate
   bindings, not a chord, and is registered as three commands. */

export interface KeyStep {
  /** Normalised `event.key`, lowercased: 'k', 'arrowup', 'enter', ' ', '?'. */
  key: string
  /** ⌘ on a Mac, Ctrl elsewhere. Resolved per platform, never hard-coded. */
  mod: boolean
  shift: boolean
  alt: boolean
}

const NAMED: Record<string, string> = {
  '↵': 'enter',
  '⌫': 'backspace',
  '↑': 'arrowup',
  '↓': 'arrowdown',
  '←': 'arrowleft',
  '→': 'arrowright',
  '⇥': 'tab',
  esc: 'escape',
  space: ' ',
}

export function parseKeys(spec: string): KeyStep[] {
  return spec.trim().split(/\s+/).map(parseStep)
}

function parseStep(token: string): KeyStep {
  let mod = false
  let shift = false
  let alt = false
  let rest = token
  // Modifier glyphs may appear in any order: the design writes ⇧⌘X, not ⌘⇧X.
  for (;;) {
    if (rest.startsWith('⌘') || rest.startsWith('⌃')) mod = true
    else if (rest.startsWith('⇧')) shift = true
    else if (rest.startsWith('⌥')) alt = true
    else break
    rest = rest.slice(1)
  }
  const key = NAMED[rest.toLowerCase()] ?? rest.toLowerCase()
  return { key, mod, shift, alt }
}

export function sameStep(a: KeyStep, b: KeyStep): boolean {
  return (
    a.key === b.key && a.mod === b.mod && a.shift === b.shift && a.alt === b.alt
  )
}

/**
 * Does this keydown satisfy this step on this platform?
 *
 * "mod" is ⌘ on a Mac and Ctrl elsewhere, and the OTHER one must be up: a
 * Windows user pressing Win+K did not ask for the palette. Shift is enforced
 * for letters, digits and named keys; for punctuation it is not, because on
 * most layouts `?` already arrives with shift held and `/` without, and the
 * character is the thing that was asked for.
 */
export function stepMatches(
  event: Pick<
    KeyboardEvent,
    'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'
  >,
  step: KeyStep,
  platform: Platform,
): boolean {
  const mod = platform === 'mac' ? event.metaKey : event.ctrlKey
  const otherMod = platform === 'mac' ? event.ctrlKey : event.metaKey
  if (otherMod) return false
  if (step.mod !== mod) return false
  if (step.alt !== event.altKey) return false

  const punctuation = step.key.length === 1 && !/[a-z0-9 ]/.test(step.key)
  if (!punctuation && step.shift !== event.shiftKey) return false

  return event.key.toLowerCase() === step.key
}

/**
 * Where a shortcut must NOT fire: inside anything that takes typed text. The
 * design's rule 01 -- shortcuts are disabled in an input, textarea or
 * contenteditable, except Escape and ⌘↵.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    // A checkbox or button-like input is a control, not a text field.
    return ![
      'checkbox',
      'radio',
      'button',
      'submit',
      'reset',
      'range',
    ].includes(type)
  }
  return false
}

/**
 * A control that already has a meaning for Space and Enter. A single-key
 * shortcut on one of these would fire twice -- once as the control's own
 * activation, once as ours -- so those are left to the control.
 */
export function isInteractiveControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'BUTTON' ||
    tag === 'A' ||
    tag === 'SUMMARY' ||
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'TEXTAREA'
  )
}

/**
 * The design's glyphs, resolved for display. A Mac keeps them; elsewhere ⌘
 * reads as Ctrl, joined with + so "Ctrl+K" renders as two keys rather than
 * one word.
 */
export function displayKeys(spec: string, platform: Platform): string {
  if (platform === 'mac') return spec
  return spec
    .split(/\s+/)
    .map((token) =>
      token
        .replace(/⌘/g, 'Ctrl+')
        .replace(/⌃/g, 'Ctrl+')
        .replace(/⇧/g, 'Shift+')
        .replace(/⌥/g, 'Alt+')
        .replace(/⌫/g, 'Backspace'),
    )
    .join(' ')
}
