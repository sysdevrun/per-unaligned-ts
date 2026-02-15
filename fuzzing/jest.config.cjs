const path = require('path');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: path.resolve(__dirname, '..'),
  roots: ['<rootDir>/fuzzing'],
  testMatch: ['**/fuzzing/**/*.test.ts'],
  // Longer timeout for fuzz tests
  testTimeout: 60000,
};
