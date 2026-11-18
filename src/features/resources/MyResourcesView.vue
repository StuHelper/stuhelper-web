<script setup lang="ts">
import AppSelect from '../../shared/ui/AppSelect.vue'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync, usePaged } from '../../shared/composables/async'
import { usePageFilters } from '../../shared/pageFilters'
import PagedState from '../../shared/ui/PagedState.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import MeLayout from '../account/MeLayout.vue'
import { localName, typeExtension, useResourcesApi, type Reference, type Version } from './api'

// The uploader's resources. Resources are corrected or withdrawn by request;
// there is no plain delete.
const { t, locale } = useI18n()
const format = useFormat()
const api = useResourcesApi()
const page = usePageFilters(['file_type', 'sort'] as const)
const fileType = computed(() => (/^[a-z0-9]{1,12}$/.test(page.values.value.file_type) ? page.values.value.file_type : ''))
const sort = computed<'newest' | 'id'>(() => (page.values.value.sort === 'id' ? 'id' : 'newest'))

const capabilities = useAsync((signal) => api.capabilities(signal))
void capabilities.reload()
const defaultTypes = ['pdf', 'zip', 'docx', 'pptx', 'txt', 'png', 'jpg']
const fileTypes = computed(() => {
  const configured = (capabilities.data.value?.allowed_types ?? []).map(typeExtension).filter((ext): ext is string => !!ext)
  return [...new Set(configured.length ? configured : defaultTypes)]
})

const courses = shallowRef(new Map<string, Reference>())
const mine = usePaged(async (after, signal) => {
  const result = await api.mine({ after, sort: sort.value, file_type: fileType.value || undefined }, signal)
  const ids = result.items.map((item) => (item.proposal ?? item.current)?.metadata.associations.course_id).filter((id): id is string => !!id && !courses.value.has(id))
  if (ids.length) {
    try {
      const found = await api.myReferences(ids, signal)
      courses.value = new Map([...courses.value, ...found])
    } catch {
      // Course labels are supplementary; the list still renders without them.
    }
  }
  return { items: result.items, next: result.next_cursor }
})
watch(page.signature, () => void mine.reload(), { immediate: true })

function courseName(courseId: string | undefined) {
  return courseId ? courses.value.get(courseId)?.name ?? '' : ''
}

function tone(state: Version['state']) {
  if (state === 'published' || state === 'approved') return 'success'
  if (state === 'rejected' || state === 'blocked') return 'danger'
  if (state === 'draft' || state === 'superseded') return 'neutral'
  return 'warning'
}
</script>

<template>
  <MeLayout
    :title="t('me.resources')"
    :description="t('me.resourcesIntro')"
  >
    <template #actions>
      <RouterLink
        class="btn btn-primary"
        to="/resources/new"
      >
        {{ t('resources.upload') }}
      </RouterLink>
    </template>
    <div class="row toolbar">
      <label class="row small">
        <span>{{ t('resources.browse.fileType') }}</span>
        <AppSelect
          :model-value="fileType"
          class="select compact-select"
          @update:model-value="(value: string) => page.replace({ file_type: value || undefined })"
        >
          <option value="">{{ t('common.all') }}</option>
          <option
            v-for="ext in fileTypes"
            :key="ext"
            :value="ext"
          >{{ ext.toUpperCase() }}</option>
        </AppSelect>
      </label>
      <label class="row small">
        <span>{{ t('resources.browse.sort') }}</span>
        <AppSelect
          :model-value="sort"
          class="select compact-select"
          @update:model-value="(value: string) => page.replace({ sort: value === 'id' ? 'id' : undefined })"
        >
          <option value="newest">{{ t('resources.browse.sortNewest') }}</option>
          <option value="id">{{ t('resources.browse.sortDefault') }}</option>
        </AppSelect>
      </label>
    </div>
    <PagedState
      :status="mine.status.value"
      :error="mine.error.value"
      :count="mine.items.value.length"
      :next="mine.next.value"
      :appending="mine.appending.value"
      :empty-text="t('me.resourcesEmpty')"
      @retry="mine.reload"
      @more="mine.loadMore"
    >
      <ul class="list">
        <li
          v-for="item in mine.items.value"
          :key="item.id"
          class="card stack-sm"
        >
          <div class="row-between">
            <RouterLink
              class="card-title"
              :to="`/resources/items/${encodeURIComponent(item.id)}`"
            >
              {{ (item.proposal ?? item.current)?.metadata.title }}
            </RouterLink>
            <StatusTag :tone="item.state === 'published' ? 'success' : item.state === 'blocked' ? 'danger' : 'neutral'">
              {{ t(`resources.state.${item.state}`) }}
            </StatusTag>
          </div>
          <p class="row subtle">
            <span v-if="courseName((item.proposal ?? item.current)?.metadata.associations.course_id)">{{ courseName((item.proposal ?? item.current)?.metadata.associations.course_id) }}</span>
            <span>{{ localName((item.proposal ?? item.current)?.category.names ?? {}, locale) }}</span>
            <span v-if="(item.proposal ?? item.current)?.created_at">{{ format.date((item.proposal ?? item.current)?.created_at ?? '') }}</span>
          </p>
          <p
            v-if="item.proposal"
            class="row small"
          >
            <span>{{ t('me.proposal') }}</span>
            <StatusTag :tone="tone(item.proposal.state)">
              {{ t(`resources.versionState.${item.proposal.state}`) }}
            </StatusTag>
            <span
              v-if="item.current && item.proposal.state === 'pending'"
              class="subtle"
            >{{ t('resources.detail.pendingVersion') }}</span>
          </p>
          <div class="row">
            <RouterLink
              class="btn btn-sm"
              :to="`/resources/items/${encodeURIComponent(item.id)}/edit`"
            >
              {{ t('me.correct') }}
            </RouterLink>
            <RouterLink
              class="btn btn-sm btn-ghost"
              :to="`/resources/items/${encodeURIComponent(item.id)}`"
            >
              {{ t('me.requestWithdrawal') }}
            </RouterLink>
          </div>
        </li>
      </ul>
    </PagedState>
  </MeLayout>
</template>

<style scoped>
.toolbar { gap: .75rem 1.25rem; }
.compact-select { width: auto; min-height: 34px; }
.card-title { color: var(--label); text-decoration: none; }
.card-title:hover { color: var(--accent); }
</style>
