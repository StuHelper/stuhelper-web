<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ReviewFeed from './ReviewFeed.vue'
const {t}=useI18n()
const kind=ref<'course'|'mentor'>('course')
</script>
<template>
  <section class="academic-page">
    <header class="community-hero">
      <p class="eyebrow">
        {{ t('brand.context') }}
      </p><h1>{{ t('academic.community') }}</h1><p>{{ t('academic.communityLead') }}</p><nav
        class="academic-actions"
        :aria-label="t('academic.community')"
      >
        <RouterLink to="/courses">
          {{ t('academic.courses') }}
        </RouterLink><RouterLink to="/teachers">
          {{ t('academic.teachers') }}
        </RouterLink><RouterLink to="/community/me">
          {{ t('academic.myCommunity') }}
        </RouterLink>
      </nav>
    </header>
    <nav
      class="academic-tabs"
      :aria-label="t('academic.community')"
    >
      <button
        :aria-pressed="kind==='course'"
        @click="kind='course'"
      >
        {{ t('academic.latestReviews') }}
      </button><button
        :aria-pressed="kind==='mentor'"
        @click="kind='mentor'"
      >
        {{ t('academic.latestMentors') }}
      </button>
    </nav>
    <ReviewFeed :kind="kind" />
  </section>
</template>
