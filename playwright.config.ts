import { defineConfig } from "@playwright/test";
import { CAPTURE_TOUR_STORAGE_KEY, ONBOARDING_STORAGE_KEY } from "./src/lib/onboarding";

const PORT = 3210;

// End-to-end tests of the user journeys. They run on a production build, with
// no keys: PayPal is simulated and the AI uses the plain-code fallback, so the
// results are repeatable and no money or AI call is involved.
export default defineConfig({
  testDir: "e2e",
  workers: 1, // one database: the tests run in series and reset the demo first
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    trace: "retain-on-failure",
    // Existing journeys model a returning visitor. Tour tests use a fresh browser.
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: ONBOARDING_STORAGE_KEY, value: "completed" }, { name: CAPTURE_TOUR_STORAGE_KEY, value: "completed" }] }] },
  },
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/api/config`,
    timeout: 240_000,
    reuseExistingServer: false,
    // Empty values win over .env.local, so a developer's real keys are not used.
    env: {
      DATABASE_PATH: "./data/e2e.db",
      PAYPAL_CLIENT_ID: "",
      PAYPAL_CLIENT_SECRET: "",
      NEXT_PUBLIC_PAYPAL_CLIENT_ID: "",
      AI_API_KEY: "",
    },
  },
});
