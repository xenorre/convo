import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// jest-dom's own typings extend Vitest's `Assertion<T>`, which Vitest 5 no
// longer lets packages merge into; `Matchers` is the interface meant for it.
// Merged declarations must repeat Vitest's type parameters, used or not.
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<unknown, R> {}
}
