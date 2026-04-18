/**
 * Combined test runner — executes all test files in tests/*.test.ts.
 *
 * Usage:
 *   node --experimental-strip-types --no-warnings tests/run.ts
 */
// @ts-expect-error — side-effect imports; each file runs its own suite.
import './resolve.test.ts';
// @ts-expect-error
import './advanced.test.ts';
