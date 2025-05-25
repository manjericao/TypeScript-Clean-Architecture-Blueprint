/**
 * Custom functions for Artillery tests,
 * These functions can be used in beforeRequest, afterResponse, and other hooks
 */
const fs = require('fs');
const path = require('path');

// Load test data before each scenario
function loadTestData(context, ee, next) {
  try {
    const dataPath = path.resolve(__dirname, '../data/test-data.json');
    const jsonData = fs.readFileSync(dataPath, 'utf8');
    const testData = JSON.parse(jsonData);

    // Add data to context
    context.vars.users = testData.users;
    console.log('Test data loaded successfully:', {
      usersCount: testData.users.length
    });
    return next();
  } catch (err) {
    console.error('Error loading test data:', err);
    return next(err);
  }
}

// Generate a random email address
function generateRandomEmail(userContext, events, done) {
  const timestamp = new Date().getTime();
  const randomString = Math.random().toString(36).substring(2, 8);
  userContext.vars.randomEmail = `user_${randomString}_${timestamp}@example.com`;
  return done();
}

// Generate a random username
function generateRandomUsername(userContext, events, done) {
  const randomString = Math.random().toString(36).substring(2, 10);
  userContext.vars.randomUsername = `user_${randomString}`;
  return done();
}

// Generate a random password (at least 8 chars with letters, numbers, and special chars)
function generateRandomPassword(userContext, events, done) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
  let password = '';

  // Ensure at least one of each type
  password += chars.charAt(Math.floor(Math.random() * 52)); // letter
  password += chars.charAt(Math.floor(Math.random() * 10) + 52); // number
  password += chars.charAt(Math.floor(Math.random() * 10) + 62); // special char

  // Add more random chars
  for (let i = 0; i < 5; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Shuffle the password
  password = password.split('').sort(() => 0.5 - Math.random()).join('');

  userContext.vars.randomPassword = password;
  return done();
}

// Generate a random date of birth (18-80 years old)
function generateRandomBirthDate(userContext, events, done) {
  const now = new Date();
  const minAge = 18;
  const maxAge = 80;

  const minYear = now.getFullYear() - maxAge;
  const maxYear = now.getFullYear() - minAge;

  const year = Math.floor(Math.random() * (maxYear - minYear + 1)) + minYear;
  const month = Math.floor(Math.random() * 12) + 1;
  const day = Math.floor(Math.random() * 28) + 1; // Simplified to avoid month-specific day counts

  userContext.vars.randomBirthDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  return done();
}

// Generate a random gender
function generateRandomGender(userContext, events, done) {
  const genders = ['MALE', 'FEMALE', 'OTHER'];
  const randomIndex = Math.floor(Math.random() * genders.length);
  userContext.vars.randomGender = genders[randomIndex];
  return done();
}

function generateRandomRole(userContext, events, done) {
  const roles = ['USER', 'ADMIN'];
  const randomIndex = Math.floor(Math.random() * roles.length);
  userContext.vars.randomRole = roles[randomIndex];
  return done();
}

// Extract and save auth token from login response
function saveAuthToken(requestParams, response, context, ee, next) {
  // Check if the response body exists and is not empty
  if (response.body && response.body.length > 0) {
    try {
      // Attempt to parse the response body as JSON
      const body = JSON.parse(response.body);
      // Check if the status code is 200 and the parsed body has a token
      if (response.statusCode === 200 && body.token) {
        context.vars.authToken = body.token;
        context.vars.userId = body.userId;
      }
    } catch (e) {
      // Log an error if JSON parsing fails
      console.error("Failed to parse response body:", e);
      // Optionally log the raw response body for debugging
      // console.error("Raw response body:", response.body);
    }
  }
  // Proceed to the next step in the scenario flow
  return next();
}


// Log response for debugging
function logResponse(requestParams, response, context, ee, next) {
  console.log(`Response status: ${response.statusCode}`);
  if (response.body) {
    try {
      console.log(`Response body: ${JSON.stringify(JSON.parse(response.body), null, 2)}`);
    } catch (e) {
      console.log(`Response body (raw): ${response.body}`); // Log raw body if JSON parsing fails
    }
  }
  return next();
}

module.exports = {
  loadTestData,
  generateRandomEmail,
  generateRandomUsername,
  generateRandomPassword,
  generateRandomBirthDate,
  generateRandomGender,
  generateRandomRole,
  saveAuthToken,
  logResponse
};
