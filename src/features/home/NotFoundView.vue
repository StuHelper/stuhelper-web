<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()
</script>

<template>
  <section class="not-found stack">
    <p class="not-found-code">
      {{ t('notFound.code') }}
    </p>
    <h1>{{ t('notFound.title') }}</h1>
    <p class="muted">
      {{ t('notFound.description') }}
    </p>
    <p>
      <RouterLink
        class="btn btn-primary"
        to="/"
      >
        {{ t('notFound.home') }}
      </RouterLink>
    </p>
  </section>
</template>

<style scoped>
.not-found { max-width: 34rem; padding-block: 3rem; }
.not-found-code { font-family: var(--mono); color: var(--accent); font-size: 1.1rem; }
</style>
