import '@testing-library/jest-dom/vitest'
import { expect } from 'vitest'
import * as axeMatchers from 'vitest-axe/matchers'

// Every component suite can assert `toHaveNoViolations`. PLAN.md 6.2 makes
// this a CI gate; wiring it from Sprint 0 means no component is ever written
// without the check being one line away.
expect.extend(axeMatchers)

/* jsdom stops short of a few browser APIs the app relies on. They are stubbed
   HERE, in the test environment, rather than guarded in product code: a
   browser always has them, and an optional call in the app would be a lie
   about where the gap is. */

// Roving row focus scrolls the selected row into view.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {}
}

// The confirm dialog and the palette use the native <dialog>. jsdom renders
// the element but implements neither showModal nor close; mirroring the
// `open` attribute is enough for role and visibility queries to behave.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
}
if (typeof HTMLDialogElement.prototype.close !== 'function') {
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}
