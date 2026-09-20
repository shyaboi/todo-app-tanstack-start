import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/* The contrast floors the design states (PLAN.md 4.6), asserted against the
   tokens as shipped rather than as intended. axe checks whatever happens to
   be rendered in a test; this checks the palette itself, so a token edit
   that dips under a floor fails here with the pair named, before any screen
   is built on it. */

const css = readFileSync(
  resolve(__dirname, '../../src/styles/tokens.css'),
  'utf8',
)

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)
  if (!m) throw new Error(`token --${name} not found or not a 6-digit hex`)
  return m[1]!
}

/* WCAG 2.x relative luminance and contrast ratio, exactly as specified. */
function luminance(hex: string): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [
    number,
    number,
  ]
  return (hi + 0.05) / (lo + 0.05)
}

const ratio = (fg: string, bg: string) =>
  Math.round(contrast(token(fg), token(bg)) * 100) / 100

/* The design states its ratios to one decimal and rounds to nearest:
   secondary/surface measures 7.57 and is written 7.6, rust-600/surface
   measures 5.88 and is written 5.9. The floors below are the design's
   numbers; the tolerance is exactly that rounding, and no more. */
const ROUNDING = 0.05
const atLeast = (floor: number) => floor - ROUNDING

describe('design tokens hold the contrast floors', () => {
  it('ink on surface: 17.4:1', () => {
    expect(ratio('ink', 'surface')).toBeGreaterThanOrEqual(atLeast(17.4))
  })

  it('secondary on surface: 7.6:1', () => {
    expect(ratio('secondary', 'surface')).toBeGreaterThanOrEqual(atLeast(7.6))
  })

  it('rust on surface: 5.9:1 -- the primary button, links, the brand', () => {
    expect(ratio('rust-600', 'surface')).toBeGreaterThanOrEqual(atLeast(5.9))
    expect(ratio('rust-700', 'surface')).toBeGreaterThanOrEqual(atLeast(5.9))
  })

  it('every status pill: at least 5.6:1', () => {
    // To do, In progress, Done -- the pairs Pill.module.css uses.
    expect(ratio('secondary', 'sunken')).toBeGreaterThanOrEqual(5.6)
    expect(ratio('rust-700', 'rust-100')).toBeGreaterThanOrEqual(5.6)
    expect(ratio('pine-600', 'pine-100')).toBeGreaterThanOrEqual(5.6)
  })

  it('the P1 priority pill and the outline chip clear AA for small text', () => {
    expect(ratio('rust-700', 'rust-50')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('secondary', 'surface')).toBeGreaterThanOrEqual(4.5)
  })

  /* Two regressions from earlier sprints, kept as floors: --meta is fine on
     --surface and fails on --sunken, which is why the sidebar and the
     palette's highlighted row use --secondary instead. */
  it('meta clears AA on surface and canvas, and is known not to on sunken', () => {
    expect(ratio('meta', 'surface')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('meta', 'canvas')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('meta', 'sunken')).toBeLessThan(4.5)
    expect(ratio('secondary', 'sunken')).toBeGreaterThanOrEqual(4.5)
  })

  it('the dark toast: surface text on ink, and its dimmer id line', () => {
    expect(ratio('surface', 'ink')).toBeGreaterThanOrEqual(7)
    expect(ratio('border', 'ink')).toBeGreaterThanOrEqual(4.5)
  })
})
