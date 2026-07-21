// ==========================================
// PLAYWRIGHT CONFIGURATION
// ==========================================
// Configuration for Electron app testing

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    testMatch: '**/*.spec.js',
    
    // Timeout for each test
    timeout: 30000,
    
    // Timeout for each assertion
    expect: {
        timeout: 5000
    },
    
    // Run tests in parallel
    fullyParallel: false, // Electron tests should run sequentially
    
    // Fail the build on CI if test.only is left in the code
    forbidOnly: !!process.env.CI,
    
    // Retry on CI only
    retries: process.env.CI ? 2 : 0,
    
    // Limit parallel workers for Electron tests
    workers: 1,
    
    // Reporter configuration
    reporter: [
        ['html', { outputFolder: 'test-results/html-report' }],
        ['json', { outputFile: 'test-results/results.json' }],
        ['list']
    ],
    
    // Shared settings for all projects
    use: {
        // Base URL
        baseURL: 'http://localhost:3000',
        
        // Screenshot on failure
        screenshot: 'only-on-failure',
        
        // Video on failure
        video: 'retain-on-failure',
        
        // Trace on failure
        trace: 'retain-on-failure',
    },

    // Configure projects for different browsers
    projects: [
        {
            name: 'electron',
            testMatch: '**/*.spec.js',
            use: {
                ...devices['Desktop Electron'],
            },
        },
    ],
});