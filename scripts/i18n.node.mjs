import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCatalogues } from './check-i18n.mjs';
test('missing translations, blank text and changed interpolation fail', () => {
  const messages = { 'zh-CN': { welcome: '{name}' }, 'en-US': { welcome: '{name}' } };
  assert.equal(validateCatalogues(messages, ['zh-CN', 'en-US']), 1);
  assert.throws(() => validateCatalogues({ ...messages, 'en-US': {} }, ['zh-CN', 'en-US']), /Missing or extra/);
  assert.throws(() => validateCatalogues({ ...messages, 'en-US': { welcome: '' } }, ['zh-CN', 'en-US']), /Empty/);
  assert.throws(() => validateCatalogues({ ...messages, 'en-US': { welcome: '{other}' } }, ['zh-CN', 'en-US']), /Interpolation/);
  assert.throws(() => validateCatalogues(messages, ['zh-CN', 'en-US', 'fr-FR']), /every configured language/);
});
test('Arabic translations include all six plural forms', () => {
  const messages = { 'zh-CN': { count: '{count} 项' }, 'ar-EG': { count: '{count} عنصر | {count} عناصر' } };
  assert.throws(() => validateCatalogues(messages, ['zh-CN', 'ar-EG']), /Plural categories/);
});
