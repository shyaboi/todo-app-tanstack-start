import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { Kbd } from '~/shared/components/Kbd'
import styles from './SearchInput.module.css'

/** The design's figure: long enough to coalesce a burst, short enough to feel live. */
export const SEARCH_DEBOUNCE_MS = 120

/**
 * The search box. Controlled by whoever owns the URL; this component never
 * navigates. It keeps a local draft so typing is instant, and reports the
 * settled value after a debounce, so every keystroke stays cancellable.
 *
 * `value` is the URL's q. `onChange` is called with the new q once typing
 * pauses -- or immediately on Escape, which clears.
 */
export function SearchInput({
  value,
  onChange,
}: {
  value: string
  onChange: (q: string) => void
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  /* Three pieces of state. `draft` is what is in the box. `pushed` is the last
     value this component reported. `seen` is the last `value` prop rendered.

     The box should follow the URL only when the URL moved for some reason
     OTHER than this component -- Back, Forward, Clear filters. So the test is
     two-part: did `value` change since the last render, and is the new value
     something other than what we ourselves reported? Comparing `value` against
     the draft instead would fail in both directions: a stale prop (the parent
     has not re-rendered since we reported) would snap the box back, and a
     debounced report arriving after more typing would clobber the newer keys. */
  const [draft, setDraft] = useState(value)
  const [pushed, setPushed] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (value !== pushed) {
      setPushed(value)
      setDraft(value)
    }
  }

  // The debounce must not restart because a parent render recreated onChange.
  const emit = useEffectEvent((q: string) => onChange(q))

  useEffect(() => {
    if (draft === pushed) return
    const timer = setTimeout(() => {
      setPushed(draft)
      emit(draft)
    }, SEARCH_DEBOUNCE_MS)
    // A new keystroke cancels the pending one: nothing stale is ever reported.
    return () => clearTimeout(timer)
  }, [draft, pushed])

  /* `/` focuses the search from anywhere -- except from inside another text
     field, where a slash is just a slash (design keyboard rule 01). This lives
     here for now; the command registry in Sprint 5 absorbs it. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey)
        return
      if (isTextEntry(event.target)) return
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  function onEscape() {
    // The design's cascade: a first Escape clears, a second leaves the field.
    if (draft !== '') {
      setDraft('')
      setPushed('')
      onChange('')
    } else {
      inputRef.current?.blur()
    }
  }

  return (
    <div className={styles.wrap}>
      {/* A real label, visually hidden: the placeholder is not a label. */}
      <label className="visually-hidden" htmlFor={id}>
        Search tasks
      </label>
      <svg
        className={styles.icon}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          cx="11"
          cy="11"
          r="7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        />
        <path
          d="m20 20-3.5-3.5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
      <input
        ref={inputRef}
        id={id}
        className={styles.input}
        type="search"
        value={draft}
        placeholder="Search tasks"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onEscape()
          }
        }}
      />
      <span className={styles.hint} aria-hidden="true">
        <Kbd keys="/" />
      </span>
    </div>
  )
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
