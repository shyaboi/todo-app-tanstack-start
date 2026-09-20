import { describe, it, expect } from 'vitest'
import {
  displayKeys,
  isInteractiveControl,
  isTextEntry,
  parseKeys,
  stepMatches,
} from './keys'

const ev = (
  key: string,
  mods: Partial<{
    meta: boolean
    ctrl: boolean
    alt: boolean
    shift: boolean
  }> = {},
) => ({
  key,
  metaKey: mods.meta ?? false,
  ctrlKey: mods.ctrl ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
})

describe('parseKeys', () => {
  it('reads the design notation for a single step', () => {
    expect(parseKeys('⌘K')).toEqual([
      { key: 'k', mod: true, shift: false, alt: false },
    ])
    expect(parseKeys('⇧⌘X')).toEqual([
      { key: 'x', mod: true, shift: true, alt: false },
    ])
    expect(parseKeys('⌘⌫')).toEqual([
      { key: 'backspace', mod: true, shift: false, alt: false },
    ])
    expect(parseKeys('⌘↵')).toEqual([
      { key: 'enter', mod: true, shift: false, alt: false },
    ])
  })

  it('accepts modifier glyphs in any order', () => {
    expect(parseKeys('⌘⇧X')).toEqual(parseKeys('⇧⌘X'))
  })

  it('reads named keys', () => {
    expect(parseKeys('esc')[0]?.key).toBe('escape')
    expect(parseKeys('Space')[0]?.key).toBe(' ')
    expect(parseKeys('↑')[0]?.key).toBe('arrowup')
    expect(parseKeys('⇥')[0]?.key).toBe('tab')
    expect(parseKeys('?')[0]?.key).toBe('?')
  })

  it('splits a chord on spaces', () => {
    expect(parseKeys('G I')).toEqual([
      { key: 'g', mod: false, shift: false, alt: false },
      { key: 'i', mod: false, shift: false, alt: false },
    ])
  })
})

describe('stepMatches', () => {
  const [modK] = parseKeys('⌘K')

  it('reads ⌘ as Meta on a Mac and Ctrl elsewhere', () => {
    expect(stepMatches(ev('k', { meta: true }), modK!, 'mac')).toBe(true)
    expect(stepMatches(ev('k', { ctrl: true }), modK!, 'mac')).toBe(false)
    expect(stepMatches(ev('k', { ctrl: true }), modK!, 'other')).toBe(true)
    expect(stepMatches(ev('k', { meta: true }), modK!, 'other')).toBe(false)
  })

  it('refuses when the other modifier is also held', () => {
    // Win+Ctrl+K on Windows is not "the palette"; nor is Ctrl+⌘K on a Mac.
    expect(
      stepMatches(ev('k', { ctrl: true, meta: true }), modK!, 'other'),
    ).toBe(false)
    expect(stepMatches(ev('k', { ctrl: true, meta: true }), modK!, 'mac')).toBe(
      false,
    )
  })

  it('does not fire an unmodified binding when a modifier is held', () => {
    const [n] = parseKeys('N')
    expect(stepMatches(ev('n'), n!, 'other')).toBe(true)
    expect(stepMatches(ev('n', { ctrl: true }), n!, 'other')).toBe(false)
    expect(stepMatches(ev('n', { alt: true }), n!, 'other')).toBe(false)
  })

  it('enforces shift for letters, so C and ⇧C are different bindings', () => {
    const [c] = parseKeys('C')
    const [shiftC] = parseKeys('⇧C')
    expect(stepMatches(ev('c'), c!, 'other')).toBe(true)
    expect(stepMatches(ev('C', { shift: true }), c!, 'other')).toBe(false)
    expect(stepMatches(ev('C', { shift: true }), shiftC!, 'other')).toBe(true)
  })

  it('ignores shift for punctuation, which already encodes it', () => {
    // On a US layout `?` arrives with shift held; the character is the intent.
    const [q] = parseKeys('?')
    expect(stepMatches(ev('?', { shift: true }), q!, 'other')).toBe(true)
    const [slash] = parseKeys('/')
    expect(stepMatches(ev('/'), slash!, 'other')).toBe(true)
  })

  it('matches keys case-insensitively', () => {
    const [e] = parseKeys('E')
    expect(stepMatches(ev('e'), e!, 'mac')).toBe(true)
  })

  it('enforces shift on named keys, so → and ⇧→ differ', () => {
    const [right] = parseKeys('→')
    const [shiftRight] = parseKeys('⇧→')
    expect(stepMatches(ev('ArrowRight'), right!, 'mac')).toBe(true)
    expect(stepMatches(ev('ArrowRight', { shift: true }), right!, 'mac')).toBe(
      false,
    )
    expect(
      stepMatches(ev('ArrowRight', { shift: true }), shiftRight!, 'mac'),
    ).toBe(true)
  })
})

describe('isTextEntry', () => {
  it('is true for the things you type into', () => {
    for (const tag of ['input', 'textarea', 'select'] as const) {
      expect(isTextEntry(document.createElement(tag))).toBe(true)
    }
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    // jsdom does not compute isContentEditable from the attribute; set it.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isTextEntry(editable)).toBe(true)
  })

  it('is false for a checkbox, which is a control not a field', () => {
    const box = document.createElement('input')
    box.type = 'checkbox'
    expect(isTextEntry(box)).toBe(false)
  })

  it('is false for a button, a list item and the body', () => {
    expect(isTextEntry(document.createElement('button'))).toBe(false)
    expect(isTextEntry(document.createElement('li'))).toBe(false)
    expect(isTextEntry(document.body)).toBe(false)
    expect(isTextEntry(null)).toBe(false)
  })
})

describe('isInteractiveControl', () => {
  it('names the elements that already own Space and Enter', () => {
    expect(isInteractiveControl(document.createElement('button'))).toBe(true)
    expect(isInteractiveControl(document.createElement('a'))).toBe(true)
    expect(isInteractiveControl(document.createElement('li'))).toBe(false)
    expect(isInteractiveControl(document.body)).toBe(false)
  })
})

describe('displayKeys', () => {
  it('leaves the design glyphs alone on a Mac', () => {
    expect(displayKeys('⇧⌘X', 'mac')).toBe('⇧⌘X')
    expect(displayKeys('G I', 'mac')).toBe('G I')
  })

  it('spells modifiers out elsewhere, joined with + so they render as separate keys', () => {
    expect(displayKeys('⌘K', 'other')).toBe('Ctrl+K')
    expect(displayKeys('⇧⌘X', 'other')).toBe('Shift+Ctrl+X')
    expect(displayKeys('⌘⌫', 'other')).toBe('Ctrl+Backspace')
    expect(displayKeys('G I', 'other')).toBe('G I')
  })
})
