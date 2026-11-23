<script setup lang="ts">
import { ChevronDown, FileText, History, Printer, ScrollText, ShieldCheck } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { ApiError } from '../../shared/api/errors'
import { useAsync, usePaged } from '../../shared/composables/async'
import { isolate } from '../../shared/format'
import AsyncState from '../../shared/ui/AsyncState.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import { useLegalApi, validSlug, validVersion, type LegalVersion } from './api'
import { layoutDocument } from './document'

// A published legal document: the current version, one fixed version (as linked from a
// consent record), or the list of all published versions. The body is the server's
// rendered and sanitised HTML; layoutDocument only lifts its header into the page and adds
// anchors, so the wording stays exactly what was published under the digest.
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
const layout = computed(() => {
  const value = document.data.value
  return value ? layoutDocument(value.html, value.version) : undefined
})
// The document's own header lines (revision and effective dates, operator) are shown as facts;
// the version line is left to the badge. A version is the document number plus its date, e.g.
// SH-TOS-2026.11.23. Without such a block the record's date is used.
const facts = computed(() => {
  const value = document.data.value
  if (!value || !layout.value) return []
  const own = layout.value.meta.filter((item) => item.value !== value.version)
  return own.length ? own : [{ label: t('legal.effective'), value: day(value.effective_date) }]
})
const shortDigest = computed(() => document.data.value?.digest.slice(0, 12) ?? '')

// Highlight the chapter being read. The observer watches the anchors layoutDocument added.
const body = ref<HTMLElement>()
const active = ref('')
let observer: IntersectionObserver | undefined
watch(layout, async (value) => {
  observer?.disconnect()
  active.value = value?.headings[0]?.id ?? ''
  await nextTick()
  if (!value?.headings.length || !body.value || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver((entries) => {
    const seen = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
    if (seen[0]) active.value = seen[0].target.id
  }, { rootMargin: '-15% 0px -70% 0px' })
  for (const heading of body.value.querySelectorAll('h2[id]')) observer.observe(heading)
}, { immediate: true })
onBeforeUnmount(() => observer?.disconnect())

const tocOpen = ref(false)
function jump(id: string) {
  tocOpen.value = false
  active.value = id
  body.value?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  history.replaceState(history.state, '', `#${id}`)
}
const print = () => window.print()
</script>

<template>
  <div class="legal">
    <template v-if="history">
      <header class="legal-hero legal-hero-compact">
        <p class="legal-eyebrow">
          {{ t('legal.eyebrow') }}
        </p>
        <h1 class="legal-title">
          <History aria-hidden="true" />{{ t('legal.history') }}
        </h1>
        <RouterLink
          class="btn btn-sm"
          :to="base"
        >
          {{ t('legal.current') }}
        </RouterLink>
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
        <ol class="legal-timeline">
          <li
            v-for="(item, index) in versions.items.value"
            :key="item.version"
          >
            <RouterLink
              class="legal-release"
              :to="`${base}/versions/${encodeURIComponent(item.version)}`"
            >
              <span class="legal-badge">{{ item.version }}</span>
              <span class="legal-release-body">
                <span
                  class="legal-release-title"
                  dir="auto"
                >{{ item.title }}</span>
                <span class="subtle small">{{ t('legal.effectiveOn', { date: day(item.effective_date) }) }}</span>
              </span>
              <span
                v-if="index === 0"
                class="legal-pill"
              >{{ t('legal.latest') }}</span>
            </RouterLink>
          </li>
        </ol>
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
      <template v-if="document.data.value && layout">
        <header class="legal-hero">
          <p class="legal-eyebrow">
            {{ t('legal.eyebrow') }}
          </p>
          <h1
            class="legal-title"
            dir="auto"
          >
            {{ document.data.value.title }}
          </h1>
          <div class="legal-facts">
            <span class="legal-badge legal-badge-lg">
              <ShieldCheck aria-hidden="true" />{{ document.data.value.version }}
            </span>
            <dl>
              <div
                v-for="item in facts"
                :key="item.label"
              >
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </div>
            </dl>
          </div>
          <div class="legal-actions">
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
              <History aria-hidden="true" />{{ t('legal.history') }}
            </RouterLink>
            <button
              class="btn btn-sm"
              type="button"
              @click="print"
            >
              <Printer aria-hidden="true" />{{ t('legal.print') }}
            </button>
          </div>
        </header>
        <p
          v-if="version"
          class="notice legal-fixed"
          role="note"
        >
          {{ t('legal.fixed') }}
        </p>
        <div
          class="legal-layout"
          :class="{ 'has-toc': layout.headings.length > 1 }"
        >
          <nav
            v-if="layout.headings.length > 1"
            class="legal-toc"
            :aria-label="t('legal.contents')"
          >
            <button
              class="legal-toc-toggle"
              type="button"
              :aria-expanded="tocOpen"
              @click="tocOpen = !tocOpen"
            >
              <ScrollText aria-hidden="true" />{{ t('legal.contents') }}
              <ChevronDown
                class="legal-toc-chevron"
                aria-hidden="true"
              />
            </button>
            <p class="legal-toc-heading">
              {{ t('legal.contents') }}
            </p>
            <ol :class="{ open: tocOpen }">
              <li
                v-for="heading in layout.headings"
                :key="heading.id"
              >
                <a
                  :href="`#${heading.id}`"
                  :aria-current="active === heading.id ? 'location' : undefined"
                  @click.prevent="jump(heading.id)"
                >{{ heading.text }}</a>
              </li>
            </ol>
          </nav>
          <article
            class="legal-paper"
            :aria-label="document.data.value.title"
          >
            <!-- The body is the server's rendered, sanitised legal HTML; the digest identifies its exact bytes. -->
            <!-- eslint-disable vue/no-v-html -->
            <div
              ref="body"
              class="legal-body"
              dir="auto"
              v-html="layout.html"
            />
            <!-- eslint-enable vue/no-v-html -->
            <footer class="legal-seal">
              <FileText aria-hidden="true" />
              <span>{{ t('legal.seal', { version: isolate(document.data.value.version), time: format.dateTime(document.data.value.published_at) }) }}</span>
              <span
                class="legal-digest"
                :title="document.data.value.digest"
              >{{ t('legal.digest', { value: shortDigest }) }}</span>
            </footer>
          </article>
        </div>
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
/* Wide screens get a reading column plus a sticky contents rail; the text itself keeps a
   comfortable line length and grows a little with the viewport. */
.legal { width: min(100%, 80rem); margin-inline: auto; display: grid; gap: clamp(1rem, 2vw, 1.75rem); }

.legal-hero { position: relative; display: grid; gap: .875rem; padding: clamp(1.5rem, 4vw, 3rem); border-radius: var(--radius-xl); background: radial-gradient(120% 140% at 0% 0%, var(--accent-soft), transparent 60%), var(--surface); box-shadow: var(--shadow-card); overflow: hidden; }
.legal-hero::after { content: ''; position: absolute; inset-inline-end: -4rem; inset-block-start: -4rem; width: 16rem; height: 16rem; border-radius: 50%; border: 1px solid var(--separator); box-shadow: 0 0 0 2.5rem var(--accent-soft), 0 0 0 5rem color-mix(in srgb, var(--accent-soft) 50%, transparent); opacity: .7; pointer-events: none; }
.legal-hero-compact { gap: .75rem; justify-items: start; }
.legal-eyebrow { display: flex; align-items: center; gap: .625rem; color: var(--label-2); font-size: .8125rem; font-weight: 550; letter-spacing: .04em; }
.legal-title { display: flex; align-items: center; gap: .625rem; max-width: 40ch; font-size: clamp(1.625rem, 1.1rem + 2vw, 2.625rem); font-weight: 700; line-height: 1.2; letter-spacing: -.01em; }
.legal-title svg { width: .9em; height: .9em; }

.legal-facts { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem 1.75rem; margin-block-start: .25rem; }
.legal-facts dl { display: flex; flex-wrap: wrap; gap: .75rem 1.75rem; }
.legal-facts dl > div { display: grid; gap: .125rem; padding-inline-start: .875rem; border-inline-start: 1px solid var(--separator); }
.legal-facts dt { color: var(--label-3); font-size: .75rem; }
.legal-facts dd { font-weight: 600; font-variant-numeric: tabular-nums; }
.legal-badge { display: inline-flex; align-items: center; gap: .375rem; padding: .25rem .625rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: .8125rem; font-weight: 650; letter-spacing: .02em; white-space: nowrap; }
.legal-badge-lg { padding: .5rem .875rem; font-size: 1rem; }
.legal-badge svg { width: 1.05em; height: 1.05em; }
.legal-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
.legal-actions svg { width: 1em; height: 1em; }
.legal-fixed { margin: 0; }

.legal-layout { display: grid; gap: 1.25rem; align-items: start; }
.legal-toc { padding: .75rem; border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-card); }
.legal-toc-heading { display: none; padding: .25rem .625rem .5rem; color: var(--label-3); font-size: .75rem; font-weight: 600; letter-spacing: .06em; }
.legal-toc-toggle { display: flex; align-items: center; gap: .5rem; width: 100%; padding: .375rem .5rem; border: 0; background: none; color: var(--label); font: inherit; font-weight: 600; cursor: pointer; }
.legal-toc-toggle svg { width: 1.1em; height: 1.1em; }
.legal-toc-chevron { margin-inline-start: auto; transition: transform .25s var(--spring); }
.legal-toc-toggle[aria-expanded='true'] .legal-toc-chevron { transform: rotate(180deg); }
.legal-toc ol { display: none; gap: 2px; margin-block-start: .25rem; }
.legal-toc ol.open { display: grid; }
.legal-toc a { display: block; padding: .4375rem .625rem; border-radius: 10px; border-inline-start: 2px solid transparent; color: var(--label-2); font-size: .875rem; line-height: 1.45; text-decoration: none; transition: background-color .2s, color .2s; }
.legal-toc a:hover { background: var(--fill); color: var(--label); }
.legal-toc a[aria-current] { border-inline-start-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 600; }

.legal-paper { padding: clamp(1.25rem, 4vw, 3.5rem); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-card); }
.legal-body { max-width: 56rem; margin-inline: auto; font-size: clamp(1rem, .95rem + .2vw, 1.0625rem); line-height: 1.9; overflow-wrap: anywhere; }
.legal-body :deep(h1) { font-size: 1.5rem; font-weight: 700; margin-block-end: 1rem; }
.legal-body :deep(h2) { scroll-margin-top: calc(var(--nav-height) + 1.5rem); margin-block: 2.75rem 1rem; padding-block-start: 1.75rem; border-block-start: 1px solid var(--separator); font-size: clamp(1.1875rem, 1.05rem + .5vw, 1.375rem); font-weight: 680; line-height: 1.4; }
.legal-body :deep(h2:first-child) { margin-block-start: 0; padding-block-start: 0; border-block-start: 0; }
.legal-body :deep(h3) { scroll-margin-top: calc(var(--nav-height) + 1.5rem); margin-block: 1.75rem .5rem; font-size: 1.0625rem; font-weight: 640; }
.legal-body :deep(p), .legal-body :deep(ul), .legal-body :deep(ol) { margin-block: .75rem; }
.legal-body :deep(ul), .legal-body :deep(ol) { padding-inline-start: 1.5rem; }
.legal-body :deep(ul) { list-style: disc; }
.legal-body :deep(ol) { list-style: decimal; }
.legal-body :deep(strong) { font-weight: 650; background: linear-gradient(transparent 62%, color-mix(in srgb, var(--accent-soft) 100%, transparent) 62%); }
.legal-body :deep(a) { color: var(--accent); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--accent) 35%, transparent); text-underline-offset: .2em; }
.legal-body :deep(a:hover) { text-decoration-color: currentColor; }
.legal-body :deep(.legal-key) { position: relative; margin-block: 0 2rem; padding: 1.125rem 1.25rem 1.125rem 1.5rem; border-radius: var(--radius-sm); background: var(--accent-soft); line-height: 1.85; }
.legal-body :deep(.legal-key)::before { content: ''; position: absolute; inset-block: .875rem; inset-inline-start: .625rem; width: 3px; border-radius: 2px; background: var(--accent); }
.legal-body :deep(.legal-key strong) { background: none; font-weight: 600; }
.legal-body :deep(.legal-table) { margin-block: 1rem; overflow-x: auto; border-radius: var(--radius-sm); border: 1px solid var(--separator); }
.legal-body :deep(table) { width: 100%; border-collapse: collapse; font-size: .9375rem; line-height: 1.65; }
.legal-body :deep(th) { background: var(--fill); font-weight: 620; white-space: nowrap; }
.legal-body :deep(th), .legal-body :deep(td) { padding: .625rem .875rem; border-block-end: 1px solid var(--separator); text-align: start; vertical-align: top; overflow-wrap: normal; }
.legal-body :deep(tr:last-child td) { border-block-end: 0; }
.legal-body :deep(pre) { overflow-x: auto; }
.legal-body :deep(blockquote) { padding-inline-start: 1rem; border-inline-start: 3px solid var(--separator); color: var(--label-2); }

.legal-seal { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; max-width: 56rem; margin: 3rem auto 0; padding-block-start: 1.25rem; border-block-start: 1px dashed var(--separator); color: var(--label-3); font-size: .8125rem; }
.legal-seal svg { width: 1em; height: 1em; }
.legal-digest { margin-inline-start: auto; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }

.legal-timeline { display: grid; gap: .625rem; }
.legal-release { display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem; border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-card); color: inherit; text-decoration: none; transition: transform .3s var(--spring), box-shadow .3s; }
.legal-release:hover { transform: translateY(-1px); box-shadow: var(--shadow-lift); }
.legal-release-body { display: grid; gap: .125rem; flex: 1; min-width: 0; }
.legal-release-title { font-weight: 600; }
.legal-pill { padding: .125rem .5rem; border-radius: 999px; background: var(--fill); color: var(--label-2); font-size: .75rem; font-weight: 600; }

/* Desktop: the contents become a sticky rail beside the text and are always open. */
@media (min-width: 1080px) {
  .legal-layout.has-toc { grid-template-columns: minmax(13rem, 17rem) minmax(0, 1fr); gap: 2rem; }
  .legal-toc { position: sticky; inset-block-start: calc(var(--nav-height) + 1.25rem); max-height: calc(100dvh - var(--nav-height) - 2.5rem); overflow-y: auto; }
  .legal-toc-toggle { display: none; }
  .legal-toc-heading { display: block; }
  .legal-toc ol { display: grid; }
}

@media print {
  .legal-actions, .legal-toc, .legal-hero::after { display: none; }
  .legal-hero, .legal-paper { box-shadow: none; background: none; padding: 0; }
  .legal-layout.has-toc { grid-template-columns: 1fr; }
}
</style>
