# Artillery Load Testing

This directory contains load and performance tests for the API using [Artillery](https://artillery.io/).

## Directory Structure

```
tests/artillery/
├── config/
│   ├── environments.yaml       # Environment-specific configurations
│   └── functions.js            # Custom JS functions for tests
├── data/
│   └── test-data.json          # Test data for scenarios
├── scenarios/
│   ├── auth/
│   │   ├── login.yaml          # Authentication load tests
│   │   └── register.yaml       # Registration load tests
│   └── user/
│       └── user-operations.yaml # User-related load tests
├── helpers/
│   └── custom-plugins.js       # Custom Artillery plugins
└── reports/                    # Generated test reports (gitignored)
```

## Available Scripts

The following npm scripts are available for running the load tests:

```bash
# Run a specific test file
npm run artillery:run <path-to-test-file>

# Run authentication tests
npm run artillery:auth

# Run registration tests
npm run artillery:register

# Run user operations tests
npm run artillery:user

# Generate a report from the test results
npm run artillery:report <path-to-json-report>

# Run a quick test (useful for debugging)
npm run artillery:quick <endpoint-url>
```

## Environment Configuration

The tests can be run against different environments by specifying the environment in the command:

```bash
# Run against the development environment
npm run artillery:auth -- -e dev

# Run against the staging environment
npm run artillery:auth -- -e staging

# Run against the production environment (use with caution!)
npm run artillery:auth -- -e production
```

## Test Data

Test data is stored in the `data/test-data.json` file. This file contains sample data for the test scenarios, such as user credentials, invalid credentials, and user updates.

## Custom Functions

Custom functions for generating random data, handling responses, etc. are defined in the `config/functions.js` file.

## Custom Plugins

Custom plugins for advanced test scenarios are defined in the `helpers/custom-plugins.js` file. These plugins provide additional functionality like custom metrics, realistic user behavior, and rate limit handling.

## Running with Environment Variables

Some tests may require environment variables for authentication tokens or other sensitive data:

```bash
# Set environment variables and run tests
AUTH_TOKEN=your-auth-token ADMIN_TOKEN=your-admin-token npm run artillery:auth
```

## Generating Reports

To generate a report from the test results:

1. Run a test with the `--output` option to save the results to a JSON file:
   ```bash
   npm run artillery:auth -- --output reports/auth-test-results.json
   ```

2. Generate an HTML report from the JSON file:
   ```bash
   npm run artillery:report reports/auth-test-results.json
   ```

## Best Practices

1. Start with low arrival rates and gradually increase them to avoid overwhelming the system.
2. Use realistic think times between requests to simulate real user behavior.
3. Include a mix of different endpoints and operations in your tests.
4. Monitor system resources during the tests to identify bottlenecks.
5. Run tests against a staging environment that mirrors production as closely as possible.
6. Be cautious when running tests against production environments.
