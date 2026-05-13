module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    verbose: true,
    collectCoverageFrom: ['server/**/*.js', '!server/server.js', '!server/config/database.js'],
    coverageDirectory: 'coverage'
};
