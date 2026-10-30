<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import ConnectionStatus from '../platform/ConnectionStatus.vue'

const { t } = useI18n()
const router = useRouter()
const query = ref('')
const entries = [
  { to: '/courses', title: 'home.entries.courses.title', text: 'home.entries.courses.text' },
  { to: '/teachers', title: 'home.entries.teachers.title', text: 'home.entries.teachers.text' },
  { to: '/resources', title: 'home.entries.resources.title', text: 'home.entries.resources.text' },
  { to: '/me/verification', title: 'home.entries.verification.title', text: 'home.entries.verification.text' },
  { to: '/contributions', title: 'home.entries.contributions.title', text: 'home.entries.contributions.text' },
  { to: '/me', title: 'home.entries.me.title', text: 'home.entries.me.text' },
] as const

function search(kind: 'courses' | 'teachers') {
  const q = query.value.trim()
  void router.push({ path: `/${kind}`, query: q ? { q } : {} })
}
</script>

<template>
  <div class="stack-lg">
    <section class="hero">
      <div class="hero-copy">
        <p class="hero-eyebrow">
          {{ t('home.eyebrow') }}
        </p>
        <h1>{{ t('home.title') }}</h1>
        <p class="hero-description">
          {{ t('home.description') }}
        </p>
      </div>
      <form
        class="hero-search"
        role="search"
        @submit.prevent="search('courses')"
      >
        <label
          class="visually-hidden"
          for="home-search"
        >{{ t('home.searchLabel') }}</label>
        <input
          id="home-search"
          v-model="query"
          class="input"
          type="search"
          maxlength="200"
          :placeholder="t('home.searchPlaceholder')"
        >
        <button
          class="btn btn-primary"
          type="submit"
        >
          {{ t('home.searchCourses') }}
        </button>
        <button
          class="btn"
          type="button"
          @click="search('teachers')"
        >
          {{ t('home.searchTeachers') }}
        </button>
      </form>
    </section>

    <section
      class="section"
      :aria-labelledby="'home-entries'"
    >
      <h2 id="home-entries">
        {{ t('home.entriesTitle') }}
      </h2>
      <ul class="grid entries">
        <li
          v-for="entry in entries"
          :key="entry.to"
        >
          <RouterLink
            class="card card-link entry"
            :to="entry.to"
          >
            <span class="card-title">{{ t(entry.title) }}</span>
            <span class="muted small">{{ t(entry.text) }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <section class="card home-status">
      <ConnectionStatus />
      <p class="subtle">
        {{ t('home.note') }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.hero { display: grid; gap: 1.5rem; padding: clamp(1.5rem, 4vw, 2.75rem); border-radius: calc(var(--radius) + 4px); background: linear-gradient(135deg, var(--accent-soft), var(--surface)); border: 1px solid var(--border); }
.hero-copy { display: grid; gap: .75rem; max-width: 42rem; }
.hero-eyebrow { color: var(--accent); font-weight: 650; font-size: .85rem; }
.hero-description { color: var(--muted); font-size: 1.02rem; }
.hero-search { display: flex; flex-wrap: wrap; gap: .5rem; max-width: 42rem; }
.hero-search .input { flex: 1 1 16rem; min-height: 44px; }
.hero-search .btn { min-height: 44px; }
.entries { list-style: none; }
.entry { display: grid; gap: .3rem; height: 100%; }
.home-status { display: grid; gap: .5rem; }
</style>
