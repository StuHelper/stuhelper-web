import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import ts from 'typescript-eslint'
import i18n from '@intlify/eslint-plugin-vue-i18n'

export default ts.config(
  { ignores: ['dist/**', 'src/api/platform.gen.ts', 'coverage/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  ...i18n.configs['flat/recommended'],
  { settings: { 'vue-i18n': { localeDir: './src/locales/*.json', messageSyntaxVersion: '^11.0.0' } }, rules: {
    '@intlify/vue-i18n/no-raw-text': ['error', { attributes: { '/.*/': ['title', 'aria-label', 'placeholder', 'alt'] }, ignorePattern: '^[0-9\\s/]*$' }],
    '@intlify/vue-i18n/no-missing-keys': 'error',
    '@intlify/vue-i18n/no-missing-keys-in-other-locales': 'error',
    '@intlify/vue-i18n/valid-message-syntax': 'error',
  } },
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: ts.parser } } },
  { files: ['src/**/*.vue'], rules: { 'no-restricted-syntax': ['error', { selector: 'Literal[value=/[\\u4e00-\\u9fff]/]', message: 'Use a locale message for user-facing text.' }], 'vue/multi-word-component-names': ['error', { ignores: ['App'] }] } },
)
