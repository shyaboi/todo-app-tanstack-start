import 'vitest'

/* vitest-axe 0.1.0 augments the old global `Vi` namespace, which Vitest 5 no
   longer reads, so `toHaveNoViolations` is registered at runtime but invisible
   to the compiler. Declaring it against the `vitest` module -- the shape
   @testing-library/jest-dom uses -- puts the types back. */
interface AxeMatchers {
  /** Asserts an axe-core results object contains no violations. */
  toHaveNoViolations(): void
}

declare module 'vitest' {
  interface Assertion extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
