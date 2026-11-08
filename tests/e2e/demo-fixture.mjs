// Combined HTTP fixture for page-level browser checks. Every response follows
// the provider contracts; no real account, school or storage is contacted.
import { fixture as academic } from './academic-fixture.mjs';
import { fixture as resourceState, routes as resourceRoutes } from './resource-fixture.mjs';
import example from '../../contracts/contribution.example.json' with { type: 'json' };

export const member = { authenticated: true, profile: { id: '00000000-0000-4000-8000-000000000001', nickname: 'Fixture student', nickname_required: false, bio: '', visibility: { school: true, badge: true, department: true, grade: false, reviews: true, resources: true }, revision: 1 }, csrf_token: 'a'.repeat(43), phone_bound: true, administrator: false, expires_at: '2030-01-01T00:00:00Z' };
const verification = {
  summary: { campus_eligibility: true, teacher_verified: false, identity_verified: false, evaluated_at: '2026-10-28T00:00:00Z', revision: 1, next_evaluation_at: null },
  schools: [{ id: 'school', name: 'Test University', enabled: true, methods: ['manual_material_review', 'student_email_outbound_otp'], notice_version: 'v1', opening_date: '2026-09-01', newcomer_days: 30, email_domain: 'example.edu', material_types: ['student_card'], revision: 1 }],
  credentials: [{ id: 'credential', school_id: 'school', method: 'manual_material_review', stage: 'bachelor', kind: 'student', state: 'active', student_display: '2026****01', revision: 1, verified_at: '2026-10-01T00:00:00Z', expires_at: null }],
};

export async function demo(page, options = {}) {
  await page.route('**/api/v1/auth/session', (route) => (options.guest ? route.fulfill({ status: 401, json: { code: 'unauthenticated' } }) : route.fulfill({ json: member })));
  await academic(page);
  await page.route('**/api/v1/system/capabilities', (route) => route.fulfill({ json: { api_version: 1, capabilities: ['platform.status'] } }));
  const resources = resourceState();
  await resourceRoutes(page, resources);
  // The academic directory answers catalog requests for every page.
  await page.unroute('**/api/v1/catalog/**');
  await page.route('**/api/v1/verification/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/summary')) return route.fulfill({ json: verification.summary });
    if (path.endsWith('/schools')) return route.fulfill({ json: verification.schools });
    if (path.endsWith('/credentials')) return route.fulfill({ json: verification.credentials });
    return route.fulfill({ json: [] });
  });
  await page.route('**/api/v1/storage-contributions**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/policy')) return route.fulfill({ json: example.policy });
    if (path.endsWith('/statistics')) return route.fulfill({ json: example.statistics });
    if (path.endsWith('/options')) return route.fulfill({ json: example.options });
    if (path.endsWith('/operations')) return route.fulfill({ json: { ...example.page, next_cursor: '' } });
    return route.fulfill({ json: { ...example.page, next_cursor: '' } });
  });
  await page.route('**/api/v1/storage/custody**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/policy')) return route.fulfill({ json: { version: 'custody-v1', digest: 'a'.repeat(64), url: 'https://example.invalid/custody', max_term_seconds: 30 * 86400 } });
    return route.fulfill({ json: { items: [{ id: '00000000-0000-4000-8000-000000000001', adapter: 'bhpan', revision: 1, state: 'ready', authorization_expires_at: '2030-01-01T00:00:00Z', request_id: '00000000-0000-4000-8000-000000000001', last_error: '' }], next_cursor: '' } });
  });
  return { resources };
}
