import { useI18n } from 'vue-i18n'

/** Translate a stable error code; unknown codes use the generic message. */
export function useErrorText() {
  const { t, te } = useI18n()
  return (code: string) => (te(`errors.${code}`) ? t(`errors.${code}`) : t('errors.unavailable'))
}
