module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^asn1-per-ts$': '<rootDir>/../src',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@noble/curves|@noble/hashes)/)',
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.js$': ['ts-jest', { useESM: false }],
  },
};
