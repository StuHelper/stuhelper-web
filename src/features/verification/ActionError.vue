<script setup lang="ts">
import { ref, watch } from 'vue'
import { useErrorText } from '../../shared/ui/messages'

const props = defineProps<{ code: string }>()
const target = ref<HTMLElement>()
const errorText = useErrorText()
watch(() => props.code, (code) => {
  if (!code) return
  target.value?.focus({ preventScroll: true })
  target.value?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
}, { flush: 'post' })
</script>

<template>
  <div
    v-if="code"
    ref="target"
    class="notice notice-error"
    role="alert"
    aria-live="assertive"
    aria-atomic="true"
    tabindex="-1"
  >
    {{ errorText(code) }}
  </div>
</template>
