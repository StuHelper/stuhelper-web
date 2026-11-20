<script setup lang="ts">
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { accessKey } from '../account/access'

const { t } = useI18n()
defineProps<{ disabled?: boolean }>()
const access = inject(accessKey, undefined)
const homePath = computed(() => (access?.state.value === 'verified' ? '/campus' : '/'))
</script>

<template>
  <section
    class="not-found"
    :role="disabled ? 'status' : undefined"
  >
    <p
      v-if="!disabled"
      class="not-found-code"
    >
      {{ t('notFound.code') }}
    </p>
    <h1>{{ t(disabled ? 'notFound.disabled' : 'notFound.title') }}</h1>
    <p
      v-if="!disabled"
      class="muted"
    >
      {{ t('notFound.description') }}
    </p>
    <RouterLink
      class="btn btn-primary"
      :to="homePath"
    >
      {{ t('notFound.home') }}
    </RouterLink>
  </section>
</template>

<style scoped>
.not-found { display: grid; justify-items: center; gap: 1rem; padding-block: clamp(3rem, 10vw, 7rem); text-align: center; }
.not-found-code { color: var(--label-3); font-size: clamp(4rem, 12vw, 7rem); font-weight: 700; line-height: 1; letter-spacing: -.04em; }
</style>
