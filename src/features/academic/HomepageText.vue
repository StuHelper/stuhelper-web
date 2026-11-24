<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string }>()
// Preserve source text. Only a whole HTTP(S) address can become an anchor.
const parts = computed(() => props.text.split(/(https?:\/\/[^\s<>"'，。；、（）]+)/giu).map((text, index, chunks) => {
  const prefix = chunks[index - 1] ?? ''
  const labeled = /(?:^|\n)\s*(?:主页|个人主页|个人网站|homepage|personal homepage|website|personal website)\s*[:：]\s*$/iu.test(prefix)
  if (index % 2 === 0 || (!labeled && /[\w/:=@?&%#-]$/u.test(prefix))) return { text }
  try {
    const url = new URL(text)
    if (url.hostname && !url.username && !url.password && !text.includes('\\') && ['http:', 'https:'].includes(url.protocol)) return { text, href: url.href }
  } catch { /* Malformed source text remains readable. */ }
  return { text }
}))
</script>

<template>
  <template
    v-for="(part, index) in parts"
    :key="index"
  >
    <a
      v-if="part.href"
      :href="part.href"
      target="_blank"
      rel="noopener noreferrer"
      referrerpolicy="no-referrer"
    >{{ part.text }}</a>
    <template v-else>
      {{ part.text }}
    </template>
  </template>
</template>
