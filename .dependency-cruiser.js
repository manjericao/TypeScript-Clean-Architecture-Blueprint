module.exports = {
  forbidden: [
    // 1. Prevent cyclic dependencies anywhere in src/
    {
      name: 'no-circular-deps',
      comment: 'Prevent circular dependencies in the codebase.',
      severity: 'error',
      from: { path: '^src' },
      to: { circular: true }
    },
    // 2. Enterprise layer: inner circle should not reference any outer layers.
    {
      name: 'enterprise-isolation',
      comment: 'Enterprise layer (inner circle) must only depend on itself.',
      severity: 'error',
      from: { path: '^src/enterprise' },
      to: { pathNot: '^src/enterprise' }
    },
    // 3. Application layer: second layer can only reference itself and enterprise.
    {
      name: 'application-deps',
      comment: 'Application layer must only depend on itself and on enterprise.',
      severity: 'error',
      from: { path: '^src/application' },
      to: { pathNot: ['^(src/application|src/enterprise)', '^events$'] }
    },
    // 4. Interface layer: third layer can only depend on itself, application, and enterprise.
    {
      name: 'interface-deps',
      comment:
        'Interface layer must only depend on itself, application, and enterprise.',
      severity: 'error',
      from: { path: '^src/interface' },
      to: { pathNot: '^(src/interface|src/application|src/enterprise)' }
    },
    // 5. Inner layers must not reference the infrastructure layer.
    {
      name: 'no-inner-to-infrastructure',
      comment:
        'Files in enterprise, application, or interface must not depend on infrastructure details.',
      severity: 'error',
      from: { path: '^src/(enterprise|application|interface)' },
      to: { path: '^src/infrastructure' }
    },
    // 6. Allow dependencies when the source file is a test or inside a __tests__ folder.
    {
      name: 'allow-test-imports',
      comment:
        'Disable public API enforcement for test files (or files within __tests__ folders).',
      severity: 'ignore',
      from: { path: '(__tests__|\\.test\\.ts)' },
      to: { path: '.*' }
    },
    // 7. Allow same-folder imports.
    {
      name: 'allow-same-folder-imports',
      comment:
        'Disable public API enforcement for dependencies between files in the same folder.',
      severity: 'ignore',
      // Matches any file in any folder and ensures that the target is in the same folder.
      from: { path: '^(.*\\/)([^/]+)\\.ts$' },
      to: { path: '^\\1[^/]+\\.ts$' }
    },
    // 8. Enforce that files import only via the public API (index.ts) except when exceptions apply.
    {
      name: 'enforce-public-api',
      comment:
        'Only import from a module’s public API (index files) and not internal details. Exceptions include test files and same folder imports.',
      severity: 'warn',
      // Exclude files that are index files or look like test files from being checked.
      from: { pathNot: '(index\\.ts|(__tests__|\\.test\\.ts))' },
      to: { pathNot: 'index\\.ts$' }
    },
    // 9. Test files should not be imported by production code.
    {
      name: 'no-test-imports',
      comment:
        'Test files (e.g., *.test.ts files) should not be imported by production code.',
      severity: 'error',
      from: { path: '^src' },
      to: { path: '\\.test\\.ts$' }
    }
  ],
  options: {
    doNotFollow: {
      dependencyTypes: ['npm']
    },
    exclude: {
      path: 'node_modules'
    },
    tsConfig: {
      fileName: 'tsconfig.json'
    }
  }
};
