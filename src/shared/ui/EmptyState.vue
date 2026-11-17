<script setup lang="ts">
import { Inbox, SearchX } from 'lucide-vue-next'
import type { Component } from 'vue'

// An empty list says what is missing, with a symbol, and may offer the next step in its slot.
// "search" is for a filter or search that matched nothing; "inbox" for a list that has no rows yet.
withDefaults(defineProps<{ text: string; hint?: string; tone?: 'inbox' | 'search'; icon?: Component }>(), { hint: '', tone: 'inbox', icon: undefined })
</script>

<template>
  <div class="empty-state">
    <span
      class="empty-state-icon"
      aria-hidden="true"
    ><component :is="icon ?? (tone === 'search' ? SearchX : Inbox)" /></span>
    <p class="empty">
      {{ text }}
    </p>
    <p
      v-if="hint"
      class="empty-state-hint"
    >
      {{ hint }}
    </p>
    <slot />
  </div>
</template>
