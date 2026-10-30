import { test as base, expect } from 'playwright/test';
import { member } from './e2e/demo-fixture.mjs';

// These suites isolate business-page behavior with HTTP fixtures. The formal
// backend suite exercises actual login, current sessions and revocation.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/v1/auth/session', route => route.fulfill({
      status: 401, json: { code: 'unauthenticated' },
    }));
    await use(page);
  },
});

// Personal pages render for a signed-in session; the server still authorizes every request.
export const memberTest = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/v1/auth/session', route => route.fulfill({ json: member }));
    await use(page);
  },
});
export { expect };
