/**
 * Jest configuration — co-located unit tests.
 *
 * Tests live BESIDE their source: src/utils/foo.ts + src/utils/foo.test.ts.
 * Three separate guards keep them out of the shipped artifact:
 *   1. tsconfig.json  "exclude": ["**\/*.test.ts"]
 *   2. gulpfile.ts    compile glob negates '!src/**\/*.test.ts'
 *   3. collectCoverageFrom below excludes them from the denominator
 * Verify with: npm run build && find dist -name '*.test.js'   -> must be empty.
 *
 * NOT an ESM setup. This project is CommonJS ("module": "commonjs", no
 * "type": "module" in package.json), so the ESM-specific options —
 * extensionsToTreatAsEsm, useESM, NODE_OPTIONS=--experimental-vm-modules,
 * moduleNameMapper for '.js' specifiers, and jest.unstable_mockModule — are
 * deliberately omitted. Plain jest.mock() works here; adding the ESM options
 * would break this config.
 *
 * Pinned to jest 27 / ts-jest 27: every newer ts-jest requires TypeScript
 * >= 4.3 and this project is on 4.2.4. Matching the runner to the project
 * avoids recompiling ~46k lines of src/ just to run tests.
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // test-support/mountRouter.ts intentionally reuses one long-lived
  // supertest server per (router, basePath) across a test file's `it()`
  // blocks, instead of spinning up a fresh ephemeral-port server per
  // request — see the comment there for why (it replaced 1000+ listen/close
  // cycles that caused rare cross-talk between concurrently churning test
  // servers). Those servers are deliberately never closed mid-run, so the
  // process needs forceExit to terminate once all tests finish.
  forceExit: true,

  // tsconfig.spec.json re-adds the jest globals. The main tsconfig.json limits
  // "types" to ["node"] because Jest drags in @types/babel__traverse, whose
  // syntax TypeScript 4.2 cannot parse — left unrestricted it breaks
  // `npm run build` with TS1005.
  globals: {
    'ts-jest': { tsconfig: 'tsconfig.spec.json' },
  },

  // Co-located discovery. test/integration/ is mocha, hits a live environment,
  // and must never be picked up here.
  roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/src/**/*.test.ts'],

  collectCoverage: false, // opt in via --coverage
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'text', 'lcov'],

  // Coverage denominator — the WHOLE of src, deliberately.
  //
  // This was previously scoped to src/utils, which produced a flattering 80%
  // while Sonar reported 3.4% for the same codebase. Two numbers describing the
  // same thing is worse than one honest low number, so the exclusion list is
  // kept to genuine bootstrap/infra that cannot be meaningfully unit tested and
  // mirrors sonar.coverage.exclusions.
  //
  // Do NOT add files here because they are untested — that is how a coverage
  // metric becomes decoration.
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/test-support/**',
    // --- bootstrap / process entrypoints (side-effectful) ---
    '!src/index.ts',
    '!src/server.ts',
    '!src/configs/**',
    // --- logging / env loading ---
    '!src/utils/logger.ts',
    '!src/utils/fileLogger.ts',
    '!src/utils/env.ts',
    // --- type-only declaration modules ---
    '!src/models/**',
  ],

  clearMocks: true,
  testTimeout: 30000,
}
