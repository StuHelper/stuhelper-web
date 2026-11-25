<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { contactMarker } from './teacherHomepage'

const props = defineProps<{ text: string; revealing?: boolean }>()
const emit = defineEmits<{ reveal: [] }>()
const { t } = useI18n()

type Part = { text: string; href?: string; contact?: true }
// Preserve source text. Only a whole HTTP(S) address can become an anchor.
function linked(source: string): Part[] {
  return source.split(/(https?:\/\/[^\s<>"'，。；、（）]+)/giu).map((text, index, chunks) => {
    const prefix = chunks[index - 1] ?? ''
    const labeled = /(?:^|\n)\s*(?:主页|个人主页|个人网站|homepage|personal homepage|website|personal website)\s*[:：]\s*$/iu.test(prefix)
    if (index % 2 === 0 || (!labeled && /[\w/:=@?&%#-]$/u.test(prefix))) return { text }
    try {
      const url = new URL(text)
      if (url.hostname && !url.username && !url.password && !text.includes('\\') && ['http:', 'https:'].includes(url.protocol)) return { text, href: url.href }
    } catch { /* Malformed source text remains readable. */ }
    return { text }
  })
}
// A hidden contact becomes a button at its own place in the text.
const parts = computed(() => props.text.split(contactMarker).flatMap((chunk, index): Part[] => [
  ...(index > 0 ? [{ text: '', contact: true as const }] : []),
  ...linked(chunk),
]))
</script>

<template>
  <template
    v-for="(part, index) in parts"
    :key="index"
  >
    <button
      v-if="part.contact"
      class="contact-reveal"
      type="button"
      :disabled="revealing"
      :aria-busy="revealing || undefined"
      @click="emit('reveal')"
    >
      {{ t('teacherHomepage.showContacts') }}
    </button>
    <a
      v-else-if="part.href"
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

<style scoped>
.contact-reveal {
  display: inline;
  padding: 0 .25em;
  border: 1px dashed var(--separator);
  border-radius: var(--radius);
  background: var(--fill);
  color: var(--accent);
  font: inherit;
  cursor: pointer;
}
.contact-reveal:disabled { cursor: progress; opacity: .7; }
.contact-reveal:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
</style>
