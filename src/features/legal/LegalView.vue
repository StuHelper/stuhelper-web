<script setup lang="ts">
import { FileText, History } from 'lucide-vue-next'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { ApiError } from '../../shared/api/errors'
import { useAsync, usePaged } from '../../shared/composables/async'
import { isolate } from '../../shared/format'
import AsyncState from '../../shared/ui/AsyncState.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import { useLegalApi, validSlug, validVersion, type LegalVersion } from './api'

// A published legal document: the current version, one fixed version (as linked from a
// consent record), or the list of all published versions. The body is the server's
// rendered and sanitised HTML, kept byte for byte with its digest, so it is shown as is.
const props = defineProps<{ slug: string; version?: string; history?: boolean }>()
const { t } = useI18n()
const format = useFormat()
const api = useLegalApi()

const validAddress = computed(() => validSlug(props.slug) && (props.version === undefined || validVersion(props.version)))
const document = useAsync((signal) => {
  if (!validAddress.value) return Promise.reject(new ApiError('not_found'))
  return props.version ? api.version(props.slug, props.version, signal) : api.current(props.slug, signal)
})
const versions = usePaged<LegalVersion>((offset, signal) => (validSlug(props.slug) ? api.versions(props.slug, offset, signal) : Promise.reject(new ApiError('not_found'))))
watch(() => [props.slug, props.version, props.history] as const, () => {
  if (props.history) void versions.reload()
  else void document.reload()
}, { immediate: true })

const base = computed(() => `/legal/${encodeURIComponent(props.slug)}`)
// The effective date is a calendar date in China; it is shown without a time-zone shift.
const day = (value: string) => format.value.calendarDate(value)
</script>

<template>
  <div class="legal stack-lg">
    <template v-if="history">
      <header class="stack-sm">
        <RouterLink
          class="small"
          :to="base"
        >
          {{ t('legal.current') }}
        </RouterLink>
        <h1 class="legal-title">
          <History aria-hidden="true" />{{ t('legal.history') }}
        </h1>
      </header>
      <PagedState
        :status="versions.status.value"
        :error="versions.error.value"
        :count="versions.items.value.length"
        :next="versions.next.value"
        :appending="versions.appending.value"
        :empty-text="t('legal.noVersions')"
        :not-found-retry-message="validAddress ? t('errors.not_found') : ''"
        @retry="versions.reload"
        @more="versions.loadMore"
      >
        <ul class="group">
          <li
            v-for="item in versions.items.value"
            :key="item.version"
          >
            <RouterLink
              class="group-row"
              :to="`${base}/versions/${encodeURIComponent(item.version)}`"
            >
              <span class="group-body">
                <span
                  class="group-title"
                  dir="auto"
                >{{ item.title }}</span>
                <span class="subtle">{{ t('legal.versionLine', { version: isolate(item.version), date: day(item.effective_date) }) }}</span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </PagedState>
    </template>
    <AsyncState
      v-else
      :status="document.status.value"
      :error="document.error.value"
      skeleton="detail"
      :not-found-retry-message="validAddress ? t(version ? 'errors.not_found' : 'legal.unpublished') : ''"
      @retry="document.reload()"
    >
      <article
        v-if="document.data.value"
        class="card stack"
        :aria-label="document.data.value.title"
      >
        <header class="legal-meta row-between">
          <p class="subtle small">
            <FileText aria-hidden="true" />
            {{ t('legal.versionLine', { version: isolate(document.data.value.version), date: day(document.data.value.effective_date) }) }}
          </p>
          <div class="row">
            <RouterLink
              v-if="version"
              class="btn btn-sm"
              :to="base"
            >
              {{ t('legal.current') }}
            </RouterLink>
            <RouterLink
              class="btn btn-sm"
              :to="`${base}/versions`"
            >
              {{ t('legal.history') }}
            </RouterLink>
          </div>
        </header>
        <p
          v-if="version"
          class="notice"
          role="note"
        >
          {{ t('legal.fixed') }}
        </p>
        <!-- The body is the server's rendered, sanitised legal HTML; the digest identifies its exact bytes. -->
        <!-- eslint-disable vue/no-v-html -->
        <div
          class="legal-body"
          dir="auto"
          v-html="document.data.value.html"
        />
        <!-- eslint-enable vue/no-v-html -->
      </article>
    </AsyncState>
  </div>
</template>

<style scoped>
.legal { max-width: 46rem; margin-inline: auto; }
.legal-title { display: flex; align-items: center; gap: .5rem; font-size: clamp(1.375rem, 1.2rem + .8vw, 1.75rem); font-weight: 650; }
.legal-title svg, .legal-meta svg { width: 1.1em; height: 1.1em; vertical-align: -.15em; }
.legal-body { line-height: 1.75; overflow-wrap: anywhere; }
.legal-body :deep(h1) { font-size: 1.5rem; font-weight: 650; margin-block-end: 1rem; }
.legal-body :deep(h2) { font-size: 1.1875rem; font-weight: 620; margin-block: 1.5rem .5rem; }
.legal-body :deep(h3) { font-size: 1.0625rem; font-weight: 600; margin-block: 1.25rem .5rem; }
.legal-body :deep(p), .legal-body :deep(ul), .legal-body :deep(ol) { margin-block: .5rem; }
.legal-body :deep(ul), .legal-body :deep(ol) { padding-inline-start: 1.5rem; }
.legal-body :deep(ul) { list-style: disc; }
.legal-body :deep(ol) { list-style: decimal; }
.legal-body :deep(pre) { overflow-x: auto; }
.legal-body :deep(table) { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
.legal-body :deep(th), .legal-body :deep(td) { padding: .375rem .625rem; border: 1px solid var(--separator); text-align: start; vertical-align: top; overflow-wrap: normal; }
.legal-body :deep(blockquote) { padding-inline-start: 1rem; border-inline-start: 3px solid var(--separator); color: var(--label-2); }
</style>
