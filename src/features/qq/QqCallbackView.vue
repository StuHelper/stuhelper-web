<script setup lang="ts">
import { CircleCheck, CircleX } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { errorCode } from '../../shared/api/errors'
import PageHeader from '../../shared/ui/PageHeader.vue'
import { useQqBindingApi, type QqStatus } from './api'

// QQ Connect returns here with `state` and `code`, or with `state` and an error when the
// user declined. The page confirms or cancels once, then removes the parameters from the
// address so a reload or a shared link cannot reuse them.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const api = useQqBindingApi()
const phase = ref<'working' | 'bound' | 'declined' | 'failed'>('working')
const failure = ref('')
const result = ref<QqStatus>()

const single = (value: unknown) => (typeof value === 'string' ? value : '')

onMounted(async () => {
  const state = single(route.query.state)
  const code = single(route.query.code)
  void router.replace({ path: route.path, query: {} })
  if (!state) {
    phase.value = 'failed'
    failure.value = 'invalid_state'
    return
  }
  try {
    if (code) {
      result.value = await api.confirmConnect({ state, code }, crypto.randomUUID())
      phase.value = 'bound'
    } else {
      // Declining at QQ still ends this attempt so the state cannot be used later.
      result.value = await api.cancelConnect({ state }, crypto.randomUUID())
      phase.value = 'declined'
    }
  } catch (error) {
    phase.value = 'failed'
    failure.value = errorCode(error).replace(/^qq_binding_/, '')
  }
})

const known = ['invalid_state', 'reauthorization_required', 'processing', 'unionid_missing', 'already_bound', 'ownership_conflict', 'rate_limited', 'account_closed', 'unavailable']
</script>

<template>
  <div class="stack-lg narrow">
    <PageHeader
      :title="t('qq.callback.title')"
      back="/me/account"
      :back-label="t('qq.callback.back')"
    />
    <div
      class="card stack center"
      role="status"
      aria-live="polite"
    >
      <template v-if="phase === 'working'">
        <p class="muted">
          {{ t('qq.callback.working') }}
        </p>
      </template>
      <template v-else-if="phase === 'bound'">
        <CircleCheck
          class="icon success"
          aria-hidden="true"
        />
        <p>{{ t('qq.callback.bound') }}</p>
        <p class="muted small">
          {{ result?.complete ? t('qq.complete') : t('qq.requirement') }}
        </p>
      </template>
      <template v-else-if="phase === 'declined'">
        <CircleX
          class="icon"
          aria-hidden="true"
        />
        <p>{{ t('qq.callback.declined') }}</p>
      </template>
      <template v-else>
        <CircleX
          class="icon danger"
          aria-hidden="true"
        />
        <p>{{ t(known.includes(failure) ? `qq.errors.${failure}` : 'qq.errors.unavailable') }}</p>
      </template>
      <RouterLink
        v-if="phase !== 'working'"
        class="btn btn-primary"
        to="/me/account"
      >
        {{ t('qq.callback.back') }}
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.narrow { max-width: 36rem; }
.center { justify-items: center; text-align: center; }
.icon { width: 2.5rem; height: 2.5rem; color: var(--label-3); }
.success { color: var(--success); }
.danger { color: var(--danger); }
</style>
