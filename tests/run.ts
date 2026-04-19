/**
 * Combined test runner — executes all test files in tests/*.test.ts.
 *
 * Usage:
 *   node --experimental-strip-types --no-warnings tests/run.ts
 */
// Side-effect imports; each file runs its own suite. Native TS strip-types
// resolves .ts specifiers directly so no ts-expect-error is needed.
import './resolve.test.ts';
import './advanced.test.ts';
import './commit.test.ts';
