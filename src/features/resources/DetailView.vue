<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync, useTask } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { useErrorText } from '../../shared/ui/messages'
import { attributeText, localName, useResourcesApi } from './api'
import RequestForm from './RequestForm.vue'

const props = defineProps<{ id: string }>()
const { t, te, locale } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const api = useResourcesApi()
const download = useTask()
const requesting = ref(false)
const entry = useAsync((signal) => api.item(props.id, signal))
// Users see the published version; a pending new version does not replace it until approved.
const version = computed(() => entry.data.value?.current ?? entry.data.value?.proposal)
const entryValue = computed(() => entry.data.value)
watch(() => props.id, () => {
  requesting.value = false
  void entry.reload()
}, { immediate: true })

async function save() {
  const item = entryValue.value
  const file = item?.current?.file
  if (!item || !file) return
  await download.run(() => api.download(item.id, file.filename, file.size))
  // Access was revoked: stop showing protected details.
  if (download.error.value === 'forbidden' || download.error.value === 'unauthenticated') entry.clear()
}

function accessReason(code: string) {
  return te(`resources.access.${code}`) ? t(`resources.access.${code}`) : t('resources.detail.accessRequired')
}
</script>

<template>
  <p
    v-if="download.error.value"
    class="notice notice-error"
    role="alert"
  >
    {{ errorText(download.error.value) }}
  </p>
  <AsyncState
    :status="entry.status.value"
    :error="entry.error.value"
    @retry="entry.reload"
  >
    <div
      v-if="entryValue && version"
      class="stack-lg"
    >
      <p>
        <RouterLink to="/resources">
          {{ t('resources.detail.back') }}
        </RouterLink>
      </p>
      <PageHeader
        :eyebrow="localName(version.category.names ?? {}, locale)"
        :title="version.metadata.title ?? ''"
      >
        <div class="row">
          <StatusTag :tone="entryValue.state === 'published' ? 'success' : entryValue.state === 'blocked' ? 'danger' : 'warning'">
            {{ t(`resources.state.${entryValue.state}`) }}
          </StatusTag>
          <span class="subtle">{{ format.date(version.created_at ?? '') }}</span>
        </div>
        <template #actions>
          <button
            v-if="entryValue.download_allowed && entryValue.current?.file"
            class="btn btn-primary"
            type="button"
            :disabled="download.busy.value"
            @click="void save()"
          >
            {{ t('resources.detail.download') }}
          </button>
          <RouterLink
            v-if="entryValue.owned"
            class="btn"
            :to="`/resources/items/${encodeURIComponent(entryValue.id)}/edit`"
          >
            {{ t('resources.edit') }}
          </RouterLink>
          <button
            class="btn btn-ghost"
            type="button"
            :aria-expanded="requesting"
            @click="requesting = !requesting"
          >
            {{ t(entryValue.owned ? 'resources.detail.requestOwner' : 'resources.detail.complain') }}
          </button>
        </template>
      </PageHeader>

      <p
        v-if="!entryValue.download_allowed"
        class="notice notice-info"
      >
        {{ accessReason(entryValue.access_reason) }}
      </p>
      <p
        v-if="entryValue.proposal && entryValue.current"
        class="notice notice-warning small"
      >
        {{ t('resources.detail.pendingVersion') }}
      </p>

      <div class="layout-aside">
        <section class="card stack">
          <p
            class="prewrap"
            :class="{ muted: !version.metadata.description }"
          >
            {{ version.metadata.description || t('resources.detail.noDescription') }}
          </p>
          <div
            v-if="version.metadata.tags.length"
            class="row"
          >
            <span
              v-for="tag in version.metadata.tags"
              :key="tag"
              class="tag tag-info"
            >{{ tag }}</span>
          </div>
          <dl class="facts">
            <div
              v-for="field in version.category.fields"
              :key="field.key"
            >
              <dt>{{ localName(field.names, locale) }}</dt>
              <dd>{{ attributeText(field, version.metadata.attributes[field.key], locale) || t('common.notProvided') }}</dd>
            </div>
          </dl>
        </section>
        <aside class="card stack">
          <h2>{{ t('resources.detail.about') }}</h2>
          <dl class="facts single">
            <div v-if="version.file">
              <dt>{{ t('resources.detail.file') }}</dt>
              <dd>{{ version.file.filename }} · {{ format.bytes(version.file.size) }}</dd>
            </div>
            <div>
              <dt>{{ t('resources.detail.access') }}</dt>
              <dd>{{ t(`resources.accessLevel.${version.metadata.access ?? 'public'}`) }}</dd>
            </div>
            <div>
              <dt>{{ t('resources.origin.label') }}</dt>
              <dd>{{ t(`resources.origin.kinds.${version.metadata.origin.kind ?? 'unknown'}`) }}</dd>
            </div>
            <div v-if="version.metadata.origin.source">
              <dt>{{ t('resources.origin.source') }}</dt>
              <dd>{{ version.metadata.origin.source }}</dd>
            </div>
            <div v-if="version.metadata.origin.author">
              <dt>{{ t('resources.origin.author') }}</dt>
              <dd>{{ version.metadata.origin.author }}</dd>
            </div>
            <div v-if="version.metadata.origin.license">
              <dt>{{ t('resources.origin.license') }}</dt>
              <dd class="prewrap">
                {{ version.metadata.origin.license }}
              </dd>
            </div>
          </dl>
          <RouterLink
            v-if="version.metadata.associations.course_id"
            class="btn btn-sm"
            :to="`/courses/${encodeURIComponent(version.metadata.associations.course_id ?? '')}`"
          >
            {{ t('resources.detail.course') }}
          </RouterLink>
        </aside>
      </div>

      <section
        v-if="requesting"
        class="card"
      >
        <RequestForm
          :resource-id="entryValue.id"
          :owned="entryValue.owned"
        />
        <p class="small">
          <RouterLink to="/me/requests">
            {{ t('me.requests') }}
          </RouterLink>
        </p>
      </section>
    </div>
  </AsyncState>
</template>

<style scoped>
.single { grid-template-columns: 1fr; }
</style>
