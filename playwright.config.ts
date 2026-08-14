import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? "3000");
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    env: {
      MARKSCAN_E2E_SCANNER: "1",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
  use: { baseURL },
});
