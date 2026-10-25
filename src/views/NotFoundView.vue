<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <section>
    <p class="eyebrow">
      {{ t('notFound.code') }}
    </p>
    <h1>{{ t('notFound.title') }}</h1>
    <p class="description">
      {{ t('notFound.description') }}
    </p>
    <RouterLink
      class="home-link"
      to="/"
    >
      {{ t('notFound.home') }}
    </RouterLink>
  </section>
</template>

<style scoped>
.eyebrow { color: var(--accent); letter-spacing: .1em; }
.description { color: var(--muted); line-height: 1.8; }
.home-link { display: inline-block; margin-top: 1rem; color: var(--accent); padding: .5rem 0; }
</style>
