import { describe, it, expect } from 'vitest'
import {
  createTaskInput,
  updateTaskInput,
  listTasksInput,
  fieldErrorsOf,
} from './task.schema'
import { nextStatus, displayRef, STATUS_LABEL } from './task.types'

describe('createTaskInput', () => {
  it('trims the title and applies the documented defaults', () => {
    const parsed = createTaskInput.parse({
      title: '  Wire optimistic updates  ',
    })
    expect(parsed).toEqual({
      title: 'Wire optimistic updates',
      notes: null,
      status: 'todo',
      dueAt: null,
      priority: 'p2',
      listId: null,
    })
  })

  it('rejects a title that is empty or only whitespace', () => {
    for (const title of ['', '   ', '\n\t']) {
      const r = createTaskInput.safeParse({ title })
      expect(
        r.success,
        `expected ${JSON.stringify(title)} to be rejected`,
      ).toBe(false)
    }
  })

  it('rejects a title over 200 characters, counted after trimming', () => {
    expect(createTaskInput.safeParse({ title: 'a'.repeat(201) }).success).toBe(
      false,
    )
    expect(createTaskInput.safeParse({ title: 'a'.repeat(200) }).success).toBe(
      true,
    )
    // Trailing space must not push a valid title over the limit.
    expect(
      createTaskInput.safeParse({ title: 'a'.repeat(200) + '   ' }).success,
    ).toBe(true)
  })

  it('rejects a status outside the closed enum', () => {
    expect(
      createTaskInput.safeParse({ title: 'x', status: 'in-progress' }).success,
    ).toBe(false)
    expect(
      createTaskInput.safeParse({ title: 'x', status: 'DONE' }).success,
    ).toBe(false)
    expect(
      createTaskInput.safeParse({ title: 'x', status: 'doing' }).success,
    ).toBe(true)
  })

  it('accepts a list id and rejects anything that is not one', () => {
    expect(
      createTaskInput.safeParse({
        title: 'x',
        listId: '64b0c0ffee0ddba11ad0c0de',
      }).success,
    ).toBe(true)
    expect(
      createTaskInput.safeParse({ title: 'x', listId: 'ship-v1' }).success,
    ).toBe(false)
  })

  it('requires dueAt to be an exact instant, not a bare date', () => {
    expect(
      createTaskInput.safeParse({
        title: 'x',
        dueAt: '2026-09-20T16:00:00.000Z',
      }).success,
    ).toBe(true)
    expect(
      createTaskInput.safeParse({ title: 'x', dueAt: '2026-09-20' }).success,
    ).toBe(false)
    expect(
      createTaskInput.safeParse({ title: 'x', dueAt: 'tomorrow 4pm' }).success,
    ).toBe(false)
  })

  it('treats a missing and an explicitly null optional the same way', () => {
    const a = createTaskInput.parse({ title: 'x' })
    const b = createTaskInput.parse({
      title: 'x',
      notes: null,
      dueAt: null,
      listId: null,
    })
    expect(a).toEqual(b)
  })

  // The security-relevant cases: the client owns none of these.
  it('refuses a client-supplied id or timestamp rather than ignoring it', () => {
    for (const field of ['id', '_id', 'createdAt', 'updatedAt']) {
      const r = createTaskInput.safeParse({ title: 'x', [field]: 'anything' })
      expect(r.success, `${field} must be rejected, not silently dropped`).toBe(
        false,
      )
    }
  })

  it('refuses unknown fields outright', () => {
    expect(
      createTaskInput.safeParse({ title: 'x', isAdmin: true }).success,
    ).toBe(false)
  })
})

describe('updateTaskInput', () => {
  const id = '507f1f77bcf86cd799439011'

  it('accepts a partial patch', () => {
    expect(
      updateTaskInput.safeParse({ id, patch: { status: 'done' } }).success,
    ).toBe(true)
  })

  it('rejects an empty patch', () => {
    expect(updateTaskInput.safeParse({ id, patch: {} }).success).toBe(false)
  })

  it('rejects an id that could not be an ObjectId', () => {
    for (const bad of [
      '',
      'abc',
      '507f1f77bcf86cd79943901',
      'zzzf1f77bcf86cd799439011',
    ]) {
      expect(
        updateTaskInput.safeParse({ id: bad, patch: { status: 'done' } })
          .success,
      ).toBe(false)
    }
  })

  it('rejects an unknown status inside the patch', () => {
    expect(
      updateTaskInput.safeParse({ id, patch: { status: 'archived' } }).success,
    ).toBe(false)
  })

  it('will not let a patch rewrite server-owned fields', () => {
    for (const field of ['id', 'createdAt', 'updatedAt']) {
      expect(
        updateTaskInput.safeParse({ id, patch: { [field]: 'x' } }).success,
        `patch.${field} must be rejected`,
      ).toBe(false)
    }
  })
})

describe('listTasksInput', () => {
  it('accepts the filter shape the URL carries', () => {
    const r = listTasksInput.safeParse({
      q: 'focus',
      status: ['todo', 'doing'],
      due: 'week',
      sort: 'relevance',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a status array containing an unknown value', () => {
    expect(listTasksInput.safeParse({ status: ['todo', 'nope'] }).success).toBe(
      false,
    )
  })

  it('rejects an object where a query string belongs', () => {
    // The shape a Mongo operator injection would have to take.
    expect(listTasksInput.safeParse({ q: { $ne: null } }).success).toBe(false)
    expect(listTasksInput.safeParse({ q: { $regex: '.*' } }).success).toBe(
      false,
    )
  })
})

describe('fieldErrorsOf', () => {
  it('maps issues to the first message per field, for the form', () => {
    const r = createTaskInput.safeParse({ title: '', status: 'nope' })
    expect(r.success).toBe(false)
    if (r.success) return
    const errors = fieldErrorsOf(r.error)
    expect(errors.title).toBe('Give the task a title.')
    expect(errors.status).toBeDefined()
  })
})

describe('task.types', () => {
  it('advances status in the order the design specifies, and wraps', () => {
    expect(nextStatus('todo')).toBe('doing')
    expect(nextStatus('doing')).toBe('done')
    expect(nextStatus('done')).toBe('todo')
  })

  it('labels every status, so colour is never the only signal', () => {
    expect(STATUS_LABEL).toEqual({
      todo: 'To do',
      doing: 'In progress',
      done: 'Done',
    })
  })

  it('derives a display ref without a counter', () => {
    expect(displayRef('507f1f77bcf86cd799439118')).toBe('TSK-9118')
  })

  /* listName moved to ~/features/lists when lists became a collection
     (PLAN.md D14); it is covered by that module's own suite. */
})
