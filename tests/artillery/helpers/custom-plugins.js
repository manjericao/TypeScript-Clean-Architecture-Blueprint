/**
 * Custom Artillery plugins for advanced test scenarios
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Plugin to seed test users before the test run
function seedTestUsersPlugin(scriptConfig, eventEmitter) {
  let usersCreated = 0;
  let usersExisting = 0;
  let usersFailed = 0;
  let isSeeded = false;

  // Load test data
  function loadTestData() {
    try {
      // Construct the path to test-data.json relative to this file
      const dataPath = path.resolve(__dirname, '../data/test-data.json');
      const jsonData = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(jsonData);
    } catch (err) {
      console.error('Error loading test data:', err);
      return { users: [] }; // Return empty users array if loading fails
    }
  }

  // Create a test user via API
  async function createTestUser(user, baseUrl) {
    try {
      await axios.post(`${baseUrl}/user`, {
        email: user.email,
        password: user.password,
        repeatPassword: user.password,
        username: user.username,
        name: user.name,
        birthDate: user.birthDate,
        gender: user.gender,
        role: user.role,
      });
      return { success: true };
    } catch (error) {
      // Check if error is because user already exists (status code 409 or similar)
      if (error.response && (error.response.status === 409 || error.response.data?.code === 'USER_ALREADY_EXISTS')) {
        return { exists: true };
      }
      return { error: error.message || 'Unknown error' };
    }
  }

  // Seed all test users
  async function seedUsers(baseUrl) {
    const testData = loadTestData();
    const { users } = testData;

    if (!users || users.length === 0) {
      console.log('⚠️ No test users found in test-data.json');
      return;
    }

    console.log(`🌱 Seeding ${users.length} test users...`);

    for (const user of users) {
      const result = await createTestUser(user, baseUrl);

      if (result.success) {
        console.log(`✅ Created test user: ${user.email}`);
        usersCreated++;
      } else if (result.exists) {
        console.log(`ℹ️ Test user already exists: ${user.email}`);
        usersExisting++;
      } else {
        console.error(`❌ Failed to create test user ${user.email}: ${result.error}`);
        usersFailed++;
      }
    }

    console.log(`🌱 Seeding complete: ${usersCreated} created, ${usersExisting} existing, ${usersFailed} failed`);
    isSeeded = true;
  }

  // Handle 'phaseStarted' event to seed data before the first phase
  eventEmitter.on('phaseStarted', async (phase) => {
    // Only seed once, at the beginning of the first phase
    if (phase.index === 0 && !isSeeded) {
      // Get base URL from config
      const target = scriptConfig.target || 'http://localhost:3001';
      const baseUrl = `${target}${scriptConfig.processor?.variables?.baseUrl || '/api/v1'}`;

      try {
        await seedUsers(baseUrl);
      } catch (error) {
        console.error('Error during test user seeding:', error);
      }
    }
  });

  // Report metrics at the end of the test
  eventEmitter.on('done', () => {
    console.log('\n=== Test Users Report ===');
    console.log(`Total test users processed: ${usersCreated + usersExisting + usersFailed}`);
    console.log(`Users created: ${usersCreated}`);
    console.log(`Users already existing: ${usersExisting}`);
    console.log(`Users failed to create: ${usersFailed}`);
    console.log('========================\n');
  });

  return {
    // Plugin interface method
    updateCustomStats: function(stats) {
      stats.testUsers = {
        created: usersCreated,
        existing: usersExisting,
        failed: usersFailed
      };
      return stats;
    }
  };
}

// Plugin to add custom metrics and reporting
function customMetricsPlugin(scriptConfig, eventEmitter) {
  let successfulLogins = 0;
  let failedLogins = 0;
  let successfulRegistrations = 0;
  let failedRegistrations = 0;
  let successfulUserOperations = 0;
  let failedUserOperations = 0;

  // Listen for response events
  eventEmitter.on('response', (req, res, userContext) => {
    // Track login metrics
    if (req.url.includes('/auth/login')) {
      if (res.statusCode === 200) {
        successfulLogins++;
      } else {
        failedLogins++;
      }
    }

    // Track registration metrics
    if (req.method === 'POST' && req.url === '/user') {
      if (res.statusCode === 201) {
        successfulRegistrations++;
      } else {
        failedRegistrations++;
      }
    }

    // Track user operations metrics
    if (req.url.includes('/user/') && req.method !== 'POST') {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        successfulUserOperations++;
      } else {
        failedUserOperations++;
      }
    }
  });

  // Report metrics at the end of the test
  eventEmitter.on('done', (stats) => {
    console.log('=== Custom Metrics Report ===');
    console.log(`Successful logins: ${successfulLogins}`);
    console.log(`Failed logins: ${failedLogins}`);
    console.log(`Successful registrations: ${successfulRegistrations}`);
    console.log(`Failed registrations: ${failedRegistrations}`);
    console.log(`Successful user operations: ${successfulUserOperations}`);
    console.log(`Failed user operations: ${failedUserOperations}`);
    console.log('============================');
  });

  return {
    // Plugin interface methods
    updateCustomStats: function(stats) {
      stats.customMetrics = {
        successfulLogins,
        failedLogins,
        successfulRegistrations,
        failedRegistrations,
        successfulUserOperations,
        failedUserOperations
      };
      return stats;
    }
  };
}

// Plugin to simulate realistic user behavior with think times
function realisticUserBehaviorPlugin(scriptConfig, eventEmitter) {
  return {
    // Add variable think times between requests to simulate real user behavior
    addVariableThinkTime: function(requestParams, context, ee, next) {
      // Generate a random think time between 1-5 seconds
      const thinkTime = Math.floor(Math.random() * 5) + 1;

      // Log the think time if debug is enabled
      if (scriptConfig.debug) {
        console.log(`User thinking for ${thinkTime} seconds...`);
      }

      // Simulate user thinking
      setTimeout(next, thinkTime * 1000);
    }
  };
}

// Plugin to handle rate-limiting and retry logic
function rateLimitHandlerPlugin(scriptConfig, eventEmitter) {
  return {
    // Handle rate limiting with exponential backoff retry
    handleRateLimit: function(requestParams, response, context, ee, next) {
      // Check if we hit a rate limit
      if (response.statusCode === 429) {
        // Get retry counts from context or initializes it
        context.vars.retryCount = context.vars.retryCount || 0;

        // Increment retry count
        context.vars.retryCount++;

        // Maximum number of retries
        const maxRetries = 3;

        if (context.vars.retryCount <= maxRetries) {
          // Calculate backoff time with exponential increase
          const backoffTime = Math.pow(2, context.vars.retryCount) * 1000;

          console.log(`Rate limited. Retrying in ${backoffTime}ms (Attempt ${context.vars.retryCount} of ${maxRetries})`);

          // Retry after backoff
          setTimeout(next, backoffTime);
        } else {
          // Max retries exceeded
          console.log('Max retries exceeded for rate limited request');
          return next();
        }
      } else {
        // Reset retry count on successful requests
        context.vars.retryCount = 0;
        return next();
      }
    }
  };
}

module.exports = {
  seedTestUsersPlugin,
  customMetricsPlugin,
  realisticUserBehaviorPlugin,
  rateLimitHandlerPlugin
};
