import { computed, ref, useId } from 'vue'
import { useFormat } from '../../app/i18n'

const reasonLimit = 2_000

export function useModerationReason() {
  const reason = ref('')
  const reasonText = computed(() => reason.value.trim())
  // Count the code points in the exact text sent to the server.
  const reasonLength = computed(() => [...reasonText.value].length)
  const reasonTooLong = computed(() => reasonLength.value > reasonLimit)
  const reasonCounterId = useId()
  const format = useFormat()
  const reasonCounter = computed(() => `${format.value.number(reasonLength.value)} / ${format.value.number(reasonLimit)}`)
  return { reason, reasonText, reasonTooLong, reasonCounter, reasonCounterId }
}
