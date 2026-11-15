import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './playwright',
    timeout: 90000,
    workers: 1,
    use: { baseURL: 'http://localhost:4100', trace: 'retain-on-failure' },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'], headless: true,
            launchOptions: { timeout: 30000 } } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } }
    ],
    webServer: { command: 'node server.mjs', env:{VIZCODE_EXECUTION_PORT:'4104'}, url: 'http://localhost:4100', reuseExistingServer: true }
});