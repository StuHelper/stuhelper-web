import { test as base, expect } from 'playwright/test';
import { member } from './e2e/demo-fixture.mjs';

const verifiedSummary = { campus_eligibility: true, teacher_verified: false, identity_verified: false, evaluated_at: '2026-10-28T00:00:00Z', revision: 1, next_evaluation_at: null };

// These suites isolate business-page behavior with HTTP fixtures. The formal
// backend suite exercises actual login, current sessions and revocation.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/v1/system/capabilities', route => route.fulfill({ json: { api_version: 1, capabilities: ['favorites.manage', 'groups.read', 'groups.manage', 'groups.configure', 'billing.manage', 'billing.membership', 'billing.wallet', 'billing.resource-unlock', 'notifications.inbox', 'open-platform.data', 'open-platform.manage', 'qq-binding.manage', 'search.query', 'information-query.query'] } }));
    await page.route('**/api/v1/auth/session', route => route.fulfill({
      status: 401, json: { code: 'unauthenticated' },
    }));
    await use(page);
  },
});

// Personal pages render for a signed-in session; the server still authorizes every request.
export const memberTest = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/v1/system/capabilities', route => route.fulfill({ json: { api_version: 1, capabilities: ['favorites.manage', 'groups.read', 'groups.manage', 'groups.configure', 'billing.manage', 'billing.membership', 'billing.wallet', 'billing.resource-unlock', 'notifications.inbox', 'open-platform.data', 'open-platform.manage', 'qq-binding.manage', 'search.query', 'information-query.query'] } }));
    await page.route('**/api/v1/auth/session', route => route.fulfill({ json: member }));
    await page.route('**/api/v1/verification/summary', route => route.fulfill({ json: verifiedSummary }));
    await use(page);
  },
});
export { expect };
