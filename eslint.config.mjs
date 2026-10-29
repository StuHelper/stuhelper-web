import js from '@eslint/js'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import vue from 'eslint-plugin-vue'
import jsonc from 'eslint-plugin-jsonc'
import i18n from '@intlify/eslint-plugin-vue-i18n'

export default defineConfigWithVueTs(
  { ignores: ['dist/**', 'src/api/platform.gen.ts', 'src/api/contribution.gen.ts', 'src/api/contribution.ts', 'src/api/storage.gen.ts', 'src/api/custody.ts', 'test-results/**', 'coverage/**'] },
  js.configs.recommended,
  ...vue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  ...jsonc.configs['flat/recommended-with-json'],
  ...i18n.configs['flat/recommended'],
  { settings: { 'vue-i18n': { localeDir: './src/locales/*.json', messageSyntaxVersion: '^11.0.0' } }, rules: {
    '@intlify/vue-i18n/no-raw-text': ['error', { attributes: { '/.*/': ['title', 'aria-label', 'placeholder', 'alt'] }, ignorePattern: '^[0-9\\s/]*$' }],
    '@intlify/vue-i18n/no-missing-keys': 'error',
    '@intlify/vue-i18n/valid-message-syntax': 'error',
    'jsonc/no-dupe-keys': 'error',
  } },
  { files: ['src/**/*.vue'], rules: { 'no-restricted-syntax': ['error', { selector: 'Literal[value=/[\\u4e00-\\u9fff]/]', message: 'Use a locale message for user-facing text.' }], 'vue/multi-word-component-names': ['error', { ignores: ['App'] }] } },
)
