<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Bookmark, BookmarkCheck } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { isFavorite, toggleFavorite, type FavKind } from '../store'
const { t: tr } = useI18n()
const props = defineProps<{ kind: FavKind; id: string; text?: boolean }>()
const on = computed(() => isFavorite(props.kind, props.id))
const pop = ref(false)
function toggle() { toggleFavorite(props.kind, props.id); pop.value = on.value }
</script>
<template>
  <button class="btn" :class="text ? '' : 'btn-sm btn-icon'" type="button" :aria-pressed="on" :aria-label="on ? tr('demo.unfavorite') : tr('demo.favorite')" :data-pop="pop || undefined" @click="toggle" @animationend="pop = false"><BookmarkCheck v-if="on" aria-hidden="true" /><Bookmark v-else aria-hidden="true" /><template v-if="text">{{ on ? tr('demo.saved') : tr('demo.favorite') }}</template></button>
</template>
