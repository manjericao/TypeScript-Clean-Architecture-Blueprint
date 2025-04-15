// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['./src'],
  testMatch: ['**/tests/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleNameMapper: {
    '^@enterprise/(.*)': '<rootDir>/src/enterprise/$1',
    '^@application/(.*)': '<rootDir>/src/application/$1',
    '^@infrastructure/(.*)': '<rootDir>/src/infrastructure/$1',
    '^@interface/(.*)': '<rootDir>/src/interface/$1'
  }
};
