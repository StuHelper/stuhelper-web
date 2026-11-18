<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { useNow } from '../../shared/composables/clock'
import { useErrorText } from '../../shared/ui/messages'
import { useResourcesApi, type Package } from './api'

// A folder download may span several packages. Every package is listed so the
// user can tell which ones are still missing, and each can be retried alone.
const props = withDefaults(defineProps<{ pack: Package; limit: number; busy?: boolean }>(), { busy: false })
const emit = defineEmits<{ recreate: [] }>()
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const api = useResourcesApi()
const now = useNow(5000)
const parts = reactive<Record<number, { busy: boolean; done: boolean; error: string }>>({})
const expired = computed(() => Date.parse(props.pack.expires_at) <= now.value)

async function download(number: number) {
  if (expired.value) return
  parts[number] ??= { busy: false, done: false, error: '' }
  // Read back through the reactive record so updates reach the template.
  const state = parts[number]
  if (!state || state.busy) return
  state.busy = true
  state.error = ''
  try {
    await api.downloadPart(props.pack, number, props.limit)
    state.done = true
  } catch (failure) {
    state.error = errorCode(failure)
  } finally {
    state.busy = false
  }
}
</script>

<template>
  <section class="card stack">
    <h2>{{ t('resources.package.title') }}</h2>
    <p class="small muted">
      {{ t('resources.package.instructions', { count: format.number(pack.parts.length) }) }}
    </p>
    <div
      v-if="expired"
      class="notice notice-warning row-between"
      role="status"
    >
      <span>{{ t('resources.package.expiredNotice') }}</span>
      <button
        class="btn btn-sm btn-primary"
        type="button"
        :disabled="busy"
        @click="emit('recreate')"
      >
        {{ t('resources.package.recreate') }}
      </button>
    </div>
    <p
      v-else
      class="subtle"
    >
      {{ t('resources.package.expires', { time: format.dateTime(pack.expires_at) }) }}
    </p>
    <ol class="list parts">
      <li
        v-for="part in pack.parts"
        :key="part.number"
        class="part stack-sm"
      >
        <div class="row-between">
          <strong>{{ t('resources.package.part', { number: format.number(part.number) }) }}</strong>
          <span class="row">
            <span class="subtle">{{ t('resources.package.size', { size: format.bytes(part.bytes), files: format.number(part.files.length) }) }}</span>
            <span
              v-if="parts[part.number]?.done"
              class="tag tag-success"
            >{{ t('resources.package.downloaded') }}</span>
            <button
              class="btn btn-sm"
              :class="parts[part.number]?.done ? '' : 'btn-primary'"
              type="button"
              :disabled="expired || parts[part.number]?.busy"
              @click="download(part.number)"
            >
              {{ t(parts[part.number]?.error ? 'common.retry' : 'resources.package.download') }}
            </button>
          </span>
        </div>
        <p
          v-if="parts[part.number]?.error"
          class="field-error"
          role="alert"
        >
          {{ errorText(parts[part.number]?.error ?? '') }}
        </p>
        <ul class="list-plain small muted">
          <li
            v-for="file in part.files"
            :key="file.version_id"
          >
            {{ file.filename }}
          </li>
        </ul>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.parts { list-style: none; }
.part { padding: .875rem 1rem; border-radius: var(--radius); background: var(--fill); }
</style>
