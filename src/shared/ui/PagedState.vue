<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LoadStatus } from '../composables/async'
import AsyncState from './AsyncState.vue'
import EmptyState from './EmptyState.vue'
import ErrorNotice from './ErrorNotice.vue'

// States of a cursor-paged list. Rows already shown stay visible while the next
// page loads or after it fails.
// `total` is the size of the whole result when the endpoint reports it; the footer then
// says how many rows are shown. `filtered` marks an empty result of a search or filter.
// `auto` loads the next page when the end of the list comes within about two screens, so
// scrolling does not stop at a button. A failed page waits for an explicit retry. Without
// IntersectionObserver the button stays.
const props = withDefaults(defineProps<{ status: LoadStatus; error: string; count: number; next: string; appending: boolean; emptyText?: string; retryLabel?: string; notFoundRetryMessage?: string; total?: number; filtered?: boolean; auto?: boolean }>(), { emptyText: '', retryLabel: '', notFoundRetryMessage: '', total: undefined, filtered: false, auto: false })
const emit = defineEmits<{ retry: []; more: [] }>()
const { t, n } = useI18n()

const canObserve = typeof IntersectionObserver !== 'undefined'
const sentinel = ref<HTMLElement>()
const near = ref(false)
let observer: IntersectionObserver | undefined
watch(sentinel, (element) => {
  observer?.disconnect()
  observer = undefined
  near.value = false
  if (!element || !props.auto || !canObserve) return
  observer = new IntersectionObserver((entries) => { near.value = entries.some((entry) => entry.isIntersecting) }, { rootMargin: '0px 0px 1600px 0px' })
  observer.observe(element)
})
onBeforeUnmount(() => observer?.disconnect())
// The observer reports only changes, so a page that still leaves the end in reach asks again
// once it has arrived.
watch(() => near.value && !!props.next && !props.appending && props.status === 'ready', (ready) => { if (ready) emit('more') })
</script>

<template>
  <AsyncState
    v-if="count === 0"
    :status="status"
    :error="error"
    :empty="true"
    :empty-text="emptyText"
    :retry-label="retryLabel"
    :not-found-retry-message="notFoundRetryMessage"
    @retry="emit('retry')"
  >
    <template #empty>
      <slot name="empty">
        <EmptyState
          :text="emptyText || t('common.empty')"
          :tone="filtered ? 'search' : 'inbox'"
        />
      </slot>
    </template>
  </AsyncState>
  <!-- A view that filters loaded rows can be empty while later pages still
       hold matching rows, so an empty page keeps the way to load more. -->
  <div
    v-if="count === 0 && status === 'ready' && next"
    class="paged-more"
  >
    <button
      class="btn"
      type="button"
      :disabled="appending"
      :aria-busy="appending"
      @click="emit('more')"
    >
      {{ t('common.loadMore') }}
    </button>
  </div>
  <template v-else-if="count !== 0">
    <slot />
    <ErrorNotice
      v-if="status === 'error'"
      :code="error"
      :retry-label="retryLabel"
      :not-found-retry-message="notFoundRetryMessage"
      @retry="emit('more')"
    />
    <div
      v-else-if="next && auto && canObserve"
      ref="sentinel"
      class="paged-more paged-auto"
      role="status"
    >
      <span
        v-if="appending"
        class="subtle"
      >{{ t('common.loading') }}</span>
    </div>
    <div
      v-else-if="next"
      class="paged-more"
    >
      <span
        v-if="total !== undefined && total > count"
        class="subtle"
      >{{ t('common.shownOf', { shown: n(count), total: n(total) }) }}</span>
      <button
        class="btn"
        type="button"
        :disabled="appending"
        :aria-busy="appending"
        @click="emit('more')"
      >
        {{ t('common.loadMore') }}
      </button>
    </div>
  </template>
</template>

<style scoped>
.paged-more { display: flex; flex-direction: column; align-items: center; gap: .5rem; }
.paged-auto { min-height: 2.5rem; }
</style>
