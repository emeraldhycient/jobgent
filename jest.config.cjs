/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testRegex: '(/__tests__/.*|\\.(test|spec))\\.(ts|tsx|js)$'
};
