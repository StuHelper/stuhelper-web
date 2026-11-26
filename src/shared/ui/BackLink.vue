<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

/**
 * A way back that returns to the page the person came from, like the browser's
 * back button. The previous page then shows its kept search, filters, inputs and
 * scroll position. Without an in-app previous page (opened from a link, a new tab
 * or after sign-in) it opens `to`, the parent page.
 */
defineOptions({ inheritAttrs: false })
const props = defineProps<{ to: string }>()
const router = useRouter()
const route = useRoute()

// Vue Router records the previous in-app location in history.state.back. The value is
// written by the router and possibly by older builds, so only a same-site path is used.
const previous = computed(() => {
  void route.fullPath
  const state: unknown = window.history.state
  const back = typeof state === 'object' && state !== null ? (state as Record<string, unknown>).back : undefined
  return typeof back === 'string' && back.startsWith('/') && !back.startsWith('//') ? back : undefined
})

function open(event: MouseEvent, navigate: (event?: MouseEvent) => unknown) {
  // Modified clicks keep the browser's own behaviour (new tab or window for the parent page).
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  if (previous.value) router.back()
  else void navigate()
}

</script>

<template>
  <RouterLink
    v-slot="{ href, navigate }"
    :to="props.to"
    custom
  >
    <a
      :href="href"
      v-bind="$attrs"
      @click="open($event, navigate)"
    ><slot :parent="!previous || previous.split(/[?#]/)[0] === props.to" /></a>
  </RouterLink>
</template>
