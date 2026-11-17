<script setup lang="ts">
import { FileText, FileType2 } from 'lucide-vue-next'
import { computed } from 'vue'

// A small page-shaped mark for one file: an icon, the file extension and a tint that is
// stable for the seed (the category), so files of one kind share a colour across pages.
const props = withDefaults(defineProps<{ filename?: string; seed?: string; small?: boolean }>(), { filename: '', seed: '', small: false })
const tints = ['var(--c-red)', 'var(--c-orange)', 'var(--c-blue)', 'var(--c-green)', 'var(--c-purple)', 'var(--c-indigo)']
const extension = computed(() => (props.filename.includes('.') ? props.filename.split('.').at(-1) ?? '' : '').slice(0, 5))
const tint = computed(() => tints[[...props.seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % tints.length])
</script>

<template>
  <span
    class="thumb"
    :class="{ small }"
    :style="{ '--c': tint }"
    aria-hidden="true"
  ><FileType2 v-if="['doc', 'docx'].includes(extension.toLowerCase())" /><FileText v-else /><i v-if="extension">{{ extension }}</i></span>
</template>

<style scoped>
.thumb { position: relative; display: grid; flex: none; justify-items: center; align-content: center; gap: 1px; width: 52px; height: 64px; border-radius: 10px; background: color-mix(in srgb, var(--c) 13%, transparent); color: var(--c); }
.thumb svg { width: 22px; height: 22px; }
.thumb i { color: color-mix(in srgb, var(--c) 62%, var(--label)); font-size: .625rem; font-style: normal; font-weight: 700; text-transform: uppercase; }
.thumb.small { width: 38px; height: 46px; border-radius: 8px; }
.thumb.small svg { width: 18px; height: 18px; }
.thumb.small i { font-size: .5625rem; }
@media (max-width: 640px) { .thumb { width: 38px; height: 48px; } .thumb svg { width: 18px; height: 18px; } }
</style>
