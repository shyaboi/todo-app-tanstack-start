import { en } from 'chrono-node'
import { LISTS, PRIORITIES, TASK_STATUSES } from './task.types'
import type { ListId, Priority, TaskStatus } from './task.types'

/* The composer's token grammar (PLAN.md D9, FE design "Composer"):

     #docs        a list, by id or by name          `@person` is cut (D1)
     !p1          a priority, p1..p3 (or !1..!3)
     ~doing       a status, in the wire vocabulary
     tomorrow 4pm a due date, in plain English

   Everything else is the title. Pure, and synchronous: the composer parses on
   every keystroke to show what it understood, and the same function runs once
   more on submit. Dates resolve here, client-side, to an exact ISO instant --
   the server never sees "tomorrow" (design validation contract). */

export type ParsedToken =
  | { kind: 'list'; raw: string; listId: ListId }
  | { kind: 'priority'; raw: string; priority: Priority }
  | { kind: 'status'; raw: string; status: TaskStatus }
  | { kind: 'date'; raw: string; dueAt: string }

export interface ParsedComposer {
  /** What is left once every recognised token is removed, whitespace tidied. */
  title: string
  listId: ListId | null
  priority: Priority | null
  status: TaskStatus | null
  /** ISO instant. */
  dueAt: string | null
  /** In the order they appeared, for the preview under the input. */
  tokens: ParsedToken[]
}

const LIST_BY_KEY = new Map<string, ListId>()
for (const list of LISTS) {
  LIST_BY_KEY.set(list.id.toLowerCase(), list.id)
  LIST_BY_KEY.set(list.name.toLowerCase(), list.id)
}

/* A recognised token stands alone: preceded by start or whitespace, and not
   glued to the next word. "#docs" is a list; "issue#42" is a title. */
const TOKEN = /(^|\s)([#!~])([\w-]+)(?=\s|$)/g

/* Prepositions that only ever introduce the date: "call mum on Friday" is a
   task to call mum, not a task to "call mum on". */
const DATE_LEAD = /\s*\b(on|at|by|due|until|before|for)\s*$/i

/* chrono is generous. "Fix May bug" is not a task due in May, and "we can
   tuesday it" should not become a Tuesday. A match is trusted only when it
   carries a digit or one of the words a person would actually use to say a
   date -- the preview chip shows the reading either way, so a wrong guess is
   visible before it is sent. */
const DATE_WORD =
  /\d|\b(today|tomorrow|tonight|yesterday|next|this|noon|midnight|morning|afternoon|evening|eod|end of|weekend|mon|tue|wed|thu|fri|sat|sun)/i

export function parseComposer(input: string, now: Date): ParsedComposer {
  const tokens: ParsedToken[] = []
  let listId: ListId | null = null
  let priority: Priority | null = null
  let status: TaskStatus | null = null

  // Pass 1: the sigil tokens. Unknown ones are left in place as title text.
  let rest = input.replace(
    TOKEN,
    (whole, lead: string, sigil: string, word: string) => {
      const raw = `${sigil}${word}`
      const key = word.toLowerCase()

      if (sigil === '#') {
        const id = LIST_BY_KEY.get(key)
        if (!id || listId) return whole
        listId = id
        tokens.push({ kind: 'list', raw, listId: id })
        return lead
      }
      if (sigil === '!') {
        const p = (key.startsWith('p') ? key : `p${key}`) as Priority
        if (!PRIORITIES.includes(p) || priority) return whole
        priority = p
        tokens.push({ kind: 'priority', raw, priority: p })
        return lead
      }
      // '~'
      const s = key as TaskStatus
      if (!TASK_STATUSES.includes(s) || status) return whole
      status = s
      tokens.push({ kind: 'status', raw, status: s })
      return lead
    },
  )

  // Pass 2: one date, from what remains.
  let dueAt: string | null = null
  const [hit] = en.casual.parse(rest, now, { forwardDate: true })
  if (hit && DATE_WORD.test(hit.text)) {
    const instant = hit.start.date()
    if (!Number.isNaN(instant.getTime())) {
      dueAt = instant.toISOString()
      tokens.push({ kind: 'date', raw: hit.text, dueAt })
      const before = rest.slice(0, hit.index).replace(DATE_LEAD, '')
      const after = rest.slice(hit.index + hit.text.length)
      rest = `${before} ${after}`
    }
  }

  return {
    title: rest.replace(/\s+/g, ' ').trim(),
    listId,
    priority,
    status,
    dueAt,
    tokens,
  }
}

/** True when the parse found anything beyond a plain title. */
export function hasTokens(parsed: ParsedComposer): boolean {
  return parsed.tokens.length > 0
}
