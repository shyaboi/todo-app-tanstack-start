import { useEffect, useEffectEvent, useRef } from 'react'
import { usePlatform } from './usePlatform'
import { isLive } from '../lib/commands'
import type { Command } from '../lib/commands'
import {
  isInteractiveControl,
  isTextEntry,
  parseKeys,
  sameStep,
  stepMatches,
} from '../lib/keys'
import type { KeyStep } from '../lib/keys'

/** How long the first key of a chord ("G", then "I") stays armed. */
export const CHORD_TIMEOUT_MS = 1000

/**
 * One document-level keydown listener that dispatches into the registry.
 *
 * The rules, in order, all from the design's Keyboard Map screen:
 *  - A native dialog that is open owns its keys; nothing here fires.
 *  - Inside a text field only Escape, ⌘K and ⌘↵ get through (rule 01).
 *  - On a button or link, only arrows get through: Space and Enter already
 *    mean something there and a shortcut would fire twice.
 *  - Browser and screen-reader combinations are never overridden (rule 04):
 *    nothing here binds ⌘W, ⌘T, ⌘L or a bare arrow outside the list.
 */
export function useShortcuts(commands: Command[], hasSelection: boolean) {
  const platform = usePlatform()
  const armed = useRef<{ step: KeyStep; at: number } | null>(null)

  // useEffectEvent, so the listener always sees the current commands and
  // selection without re-subscribing on every render.
  const dispatch = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return
    if (document.querySelector('dialog[open]')) return

    const target = event.target
    const passThroughAnywhere =
      event.key === 'Escape' ||
      stepMatches(
        event,
        { key: 'k', mod: true, shift: false, alt: false },
        platform,
      ) ||
      stepMatches(
        event,
        { key: 'enter', mod: true, shift: false, alt: false },
        platform,
      )
    const isArrow = event.key === 'ArrowUp' || event.key === 'ArrowDown'

    if (isTextEntry(target) && !passThroughAnywhere) return
    if (
      isInteractiveControl(target) &&
      !isTextEntry(target) &&
      !isArrow &&
      !passThroughAnywhere
    ) {
      return
    }

    const bound = commands
      .filter((c) => c.keys && isLive(c, hasSelection))
      .map((c) => ({ command: c, steps: parseKeys(c.keys!) }))

    // Second key of an armed chord.
    const pending = armed.current
    armed.current = null
    if (pending && Date.now() - pending.at < CHORD_TIMEOUT_MS) {
      const hit = bound.find(
        (b) =>
          b.steps.length === 2 &&
          sameStep(b.steps[0]!, pending.step) &&
          stepMatches(event, b.steps[1]!, platform),
      )
      if (hit) {
        event.preventDefault()
        hit.command.run()
        return
      }
    }

    const single = bound.find(
      (b) => b.steps.length === 1 && stepMatches(event, b.steps[0]!, platform),
    )
    if (single) {
      event.preventDefault()
      single.command.run()
      return
    }

    // First key of a chord: arm it and wait.
    const prefix = bound.find(
      (b) => b.steps.length === 2 && stepMatches(event, b.steps[0]!, platform),
    )
    if (prefix) {
      event.preventDefault()
      armed.current = { step: prefix.steps[0]!, at: Date.now() }
    }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => dispatch(event)
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
