import { defineConfig, devices } from '@playwright/test';

// Parallel worktrees each run this test; SMOKE_PORT keeps them off each other's port.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const PORT = Number(env?.SMOKE_PORT ?? 4317);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
