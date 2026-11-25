<script setup lang="ts">
import { onActivated, onDeactivated, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { hue } from '../../shared/hue'
import type { Limiter } from '../../shared/limit'
import { useTeacherHomepage } from './teacherHomepage'

const props = defineProps<{ id: string; name: string; url?: string; limit: Limiter }>()
const { t } = useI18n()
const api = useTeacherHomepage()
const face = ref<HTMLElement>()
const active = ref(true)
const image = ref('')
onActivated(() => { active.value = true })
onDeactivated(() => { active.value = false })

watch(() => [face.value, active.value, props.url, props.id] as const, ([element, enabled, url, id], _, cleanup) => {
  if (!element || !enabled || !url || !url.startsWith(`/api/v1/catalog/objects/${id}/teacher-homepage/photos/`)) return
  const controller = new AbortController()
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return
    observer.disconnect()
    void props.limit(controller.signal, async () => {
      const blob = await api.thumbnail(url, controller.signal)
      if (!controller.signal.aborted) image.value = URL.createObjectURL(blob)
    }).catch(() => { /* Keep the initial when the request fails or the photo is withdrawn. */ })
  })
  observer.observe(element)
  cleanup(() => {
    controller.abort()
    observer.disconnect()
    clearImage()
  })
}, { flush: 'post' })

function clearImage() {
  if (image.value) URL.revokeObjectURL(image.value)
  image.value = ''
}
</script>

<template>
  <span
    ref="face"
    class="face"
    :style="{ background: `color-mix(in srgb, ${hue(id)} 72%, black)` }"
  >
    <img
      v-if="image"
      :src="image"
      :alt="t('teacherHomepage.photo', { name })"
      width="44"
      height="44"
      @error="clearImage"
    >
    <span v-else aria-hidden="true">{{ [...name][0] }}</span>
  </span>
</template>

<style scoped>
.face { display: grid; flex: none; place-items: center; width: 44px; height: 44px; overflow: hidden; border-radius: 50%; color: #fff; font-weight: 600; }
.face img { display: block; width: 100%; height: 100%; object-fit: cover; }
</style>
