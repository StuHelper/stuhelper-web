import { test as base, expect } from 'playwright/test';
import { member } from './e2e/demo-fixture.mjs';

const verifiedSummary = { campus_eligibility: true, teacher_verified: false, identity_verified: false, evaluated_at: '2026-10-28T00:00:00Z', revision: 1, next_evaluation_at: null };

// These suites isolate business-page behavior with HTTP fixtures. The formal
// backend suite exercises actual login, current sessions and revocation.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/v1/system/capabilities', route => route.fulfill({ json: { api_version: 1, capabilities: ['catalog.read', 'reviews.read', 'favorites.manage', 'groups.read', 'groups.manage', 'groups.configure', 'billing.manage', 'billing.membership', 'billing.wallet', 'billing.resource-unlock', 'notifications.inbox', 'open-platform.data', 'open-platform.manage', 'qq-binding.manage', 'qq-binding.connect', 'qq-binding.onebot', 'qq-binding.official', 'search.query', 'information-query.query', 'storage.custody'] } }));
    await page.route('**/api/v1/auth/session', route => route.fulfill({
      status: 401, json: { code: 'unauthenticated' },
    }));
    await use(page);
  },
});

// Personal pages render for a signed-in session; the server still authorizes every request.
export const memberTest = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/v1/system/capabilities', route => route.fulfill({ json: { api_version: 1, capabilities: ['catalog.read', 'reviews.read', 'favorites.manage', 'groups.read', 'groups.manage', 'groups.configure', 'billing.manage', 'billing.membership', 'billing.wallet', 'billing.resource-unlock', 'notifications.inbox', 'open-platform.data', 'open-platform.manage', 'qq-binding.manage', 'qq-binding.connect', 'qq-binding.onebot', 'qq-binding.official', 'search.query', 'information-query.query', 'storage.custody'] } }));
    await page.route('**/api/v1/auth/session', route => route.fulfill({ json: member }));
    await page.route('**/api/v1/auth/phone', route => route.fulfill({ json: { bound: true, masked_phone: '138****1234' } }));
    await page.route('**/api/v1/verification/summary', route => route.fulfill({ json: verifiedSummary }));
    await page.route('**/api/v1/verification/email-transfer-consent', route => route.fulfill({ json: {
      document: { document_id: 'email-transfer', version: 'v1', digest: 'a'.repeat(64), url: 'https://example.invalid/legal/email-transfer/v1' },
      accepted: false,
    } }));
    // The navigation bell reads the unread count on every page. Suites about notifications register their own answer later, which wins.
    await page.route('**/api/v1/notifications/unread-count', route => route.fulfill({ json: {
      count: 0,
      by_box: { interaction: 0, review: 0, verification: 0, system: 0 },
      by_type: { interaction: 0, business: 0, security: 0, account: 0 },
    } }));
    await use(page);
  },
});
export { expect };
