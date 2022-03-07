// main jest configuration file
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');

module.exports = {
    rootDir: BASE_DIR,
    collectCoverage: true,
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'src/**.js',
        'src/**/*.js',
        'src/**/**/*.js'
    ],
    coverageReporters: [
        'clover',
        'text',
        'json',
        'json-summary',
        'lcov'
    ],
    reporters: [
        'default',
        [
            'jest-junit',
            {
                output: '<rootDir>/coverage/junit.xml'
            }
        ]
    ],
    testRunner: 'jest-circus/runner',
    testRegex: 'test/.*\\.js',
    testEnvironment: 'node',
    testPathIgnorePatterns: [
        '/node_modules/'
    ],
    moduleFileExtensions: [
        'js'
    ]
};
