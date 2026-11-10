<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { pendingTitle } from './pendingTitle'

// 骨架屏接近真实版式，内容到达时页面不会大幅跳动。
withDefaults(defineProps<{ variant?: 'list' | 'detail' | 'home' | 'bands' }>(), { variant: 'list' })
const { t } = useI18n()
</script>

<template>
  <div
    class="skeleton"
    :class="`skeleton-${variant}`"
    aria-busy="true"
  >
    <span class="visually-hidden">{{ t('common.loading') }}</span>
    <template v-if="variant === 'detail'">
      <b
        v-if="pendingTitle"
        class="skeleton-title"
        aria-hidden="true"
      >{{ pendingTitle }}</b>
      <span
        v-else
        class="bar-title"
        aria-hidden="true"
      />
      <span
        class="bar-line"
        aria-hidden="true"
      />
      <span
        class="block-tall"
        aria-hidden="true"
      />
      <span
        aria-hidden="true"
      />
      <span
        aria-hidden="true"
      />
    </template>
    <template v-else-if="variant === 'home'">
      <span
        class="bar-title"
        aria-hidden="true"
      />
      <div class="skeleton-columns">
        <span
          class="block-tall"
          aria-hidden="true"
        />
        <span
          class="block-tall"
          aria-hidden="true"
        />
      </div>
      <span
        aria-hidden="true"
      />
    </template>
    <div
      v-else-if="variant === 'bands'"
      class="skeleton-bands"
    >
      <span
        v-for="band in 5"
        :key="band"
        aria-hidden="true"
      />
    </div>
    <template v-else>
      <span
        v-for="row in 3"
        :key="row"
        aria-hidden="true"
      />
    </template>
  </div>
</template>
