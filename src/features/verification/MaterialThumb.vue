<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useVerification, type Material } from './api'

const props = defineProps<{ material: Material; alt: string }>()
const api = useVerification()
const src = ref('')
let controller: AbortController | undefined

function release() {
  controller?.abort()
  controller = undefined
  if (src.value) {
    URL.revokeObjectURL(src.value)
    src.value = ''
  }
}

watch(() => [props.material.id, props.material.content_type] as const, ([id, contentType]) => {
  release()
  if (contentType !== 'image/jpeg' && contentType !== 'image/png') return
  const current = new AbortController()
  controller = current
  void api.material(id, current.signal)
    .then((blob) => {
      if (controller !== current) return
      src.value = URL.createObjectURL(blob)
    })
    .catch(() => {
      // A missing or unauthorized preview leaves the plain text label intact.
    })
}, { immediate: true })

onBeforeUnmount(release)
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="alt"
    class="material-thumb"
  >
</template>

<style scoped>
.material-thumb { width: 44px; height: 44px; border-radius: var(--radius-sm); background: var(--fill); object-fit: cover; flex: none; }
</style>
