import { describe, it, expect } from 'vitest'

// Proves the unit harness itself runs before any real logic depends on it.
// Replaced by task.schema and task.filters coverage in Sprints 1 and 3.
describe('test harness', () => {
  it('runs', () => {
    expect(true).toBe(true)
  })
})
