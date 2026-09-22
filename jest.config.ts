/**
 * Jest configuration for BoonTrack Inbox (Next.js + TypeScript)
 * Using ts-jest for TypeScript transpilation without babel.
 */
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx', '**/tests/**/*.test.ts'],
  moduleNameMapper: {
    // Resolve Next.js path aliases
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        // Override tsconfig for tests — relax some strict options
        module: 'CommonJS',
        esModuleInterop: true,
      },
    }],
  },
  // Mock Next.js server modules that don't exist in test environment
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  collectCoverageFrom: [
    'lib/payment/**/*.ts',
    '!lib/payment/**/*.d.ts',
  ],
};

export default config;
