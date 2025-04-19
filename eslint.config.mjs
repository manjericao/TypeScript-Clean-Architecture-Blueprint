import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierPlugin from 'eslint-plugin-prettier';
import jestPlugin from 'eslint-plugin-jest';
import importPlugin from 'eslint-plugin-import';

export default [
  {
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: '.',
        sourceType: 'module',
        ecmaVersion: 2022,
      },
      globals: {
        node: true,
        jest: true,
        es2022: true,
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'prettier': prettierPlugin,
      'jest': jestPlugin,
      'import': importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      ...tsPlugin.configs['recommended-requiring-type-checking'].rules,
      ...importPlugin.configs.typescript.rules,
      'prettier/prettier': 'warn',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
          pathGroups: [
            { pattern: '@enterprise/**', group: 'internal' },
            { pattern: '@infrastructure/**', group: 'internal' },
            { pattern: '@application/**', group: 'internal' },
            { pattern: '@interface/**', group: 'internal' },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
        },
      ],
    },
    files: ['**/*.ts']
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '**/*.test.ts',       // Ignore test files
      '**/*.spec.ts',       // Ignore spec files
      'test/**',            // Ignore test directory
      '__tests__/**'        // Ignore __tests__ directory
    ]
  }
];
