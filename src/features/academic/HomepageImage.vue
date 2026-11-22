<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ApiError } from '../../shared/api/errors'
import { useInView } from '../../shared/composables/inView'
import { useTeacherHomepage, type CopiedImage } from './teacherHomepage'

// One copied body image. It is read with the session only once it scrolls into view, shown
// from a temporary object URL and released when the item changes or the page closes.
const props = defineProps<{ item: CopiedImage }>()
const emit = defineEmits<{ gone: [] }>()
const { t } = useI18n()
const api = useTeacherHomepage()
const frame = ref<HTMLElement>()
const seen = useInView(frame)
const url = ref('')
const failed = ref(false)
let request: AbortController | undefined

function release() {
  request?.abort()
  request = undefined
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
}
function decodeFailed() {
  release()
  failed.value = true
}
watch([seen, () => props.item.url], async ([visible]) => {
  release()
  failed.value = false
  if (!visible) return
  const controller = new AbortController()
  request = controller
  try {
    const blob = await api.bodyImage(props.item.url, controller.signal)
    if (!controller.signal.aborted) url.value = URL.createObjectURL(blob)
  } catch (error) {
    if (controller.signal.aborted) return
    failed.value = true
    // A withdrawn image (404, revoked access) means the page's media list is out of date.
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) emit('gone')
  }
}, { immediate: true })
onBeforeUnmount(release)
</script>

<template>
  <figure
    ref="frame"
    class="homepage-image"
  >
    <img
      v-if="url"
      :src="url"
      :width="item.image.width"
      :height="item.image.height"
      :alt="item.title ?? t('teacherHomepage.media.image')"
      decoding="async"
      @error="decodeFailed"
    >
    <span
      v-else
      class="homepage-image-slot"
      :style="{ aspectRatio: `${item.image.width} / ${item.image.height}` }"
      :aria-busy="!failed || undefined"
    >{{ failed ? t('teacherHomepage.media.imageFailed') : '' }}</span>
    <figcaption
      v-if="item.title"
      class="subtle small"
    >
      {{ item.title }}
    </figcaption>
  </figure>
</template>

<style scoped>
.homepage-image { display: grid; gap: .25rem; max-width: 100%; }
.homepage-image img, .homepage-image-slot { display: block; width: 100%; max-width: min(100%, 40rem); height: auto; border-radius: var(--radius); background: var(--fill); }
.homepage-image-slot { display: grid; place-items: center; max-height: 24rem; color: var(--label-2); font-size: .875rem; }
</style>
