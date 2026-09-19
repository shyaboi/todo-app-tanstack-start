import '@testing-library/jest-dom/vitest'
import { expect } from 'vitest'
import * as axeMatchers from 'vitest-axe/matchers'

// Every component suite can assert `toHaveNoViolations`. PLAN.md 6.2 makes
// this a CI gate; wiring it from Sprint 0 means no component is ever written
// without the check being one line away.
expect.extend(axeMatchers)
