/**
 * Jest runs the pure-logic unit tests under __tests__/unit with ts-jest.
 * The integration suite (__tests__/integration) hits the real Anthropic API
 * and is gated behind the INTEGRATION=1 env var so it never runs by default.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: process.env.INTEGRATION
    ? []
    : ['<rootDir>/__tests__/integration/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react', module: 'commonjs' } }],
  },
};
