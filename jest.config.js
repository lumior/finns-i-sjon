module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    globalSetup: '<rootDir>/tests/global-setup.js',
    setupFiles: ['<rootDir>/tests/setup.js'],
    verbose: true,
    collectCoverageFrom: ['server/**/*.js', '!server/server.js', '!server/config/database.js'],
    coverageDirectory: 'coverage',
    coverageThreshold: {
        global: {
            branches: 25,
            functions: 30,
            lines: 30,
            statements: 30
        }
    }
};
