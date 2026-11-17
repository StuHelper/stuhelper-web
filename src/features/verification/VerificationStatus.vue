<script setup lang="ts">
import { BadgeCheck, CircleDashed, FilePenLine, Hourglass, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-vue-next'
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import type { Application, Credential } from './api'

// The one place that answers "where do I stand": a symbol, a sentence and the next step.
// The standing is derived from server facts by the flow; this component only presents it.
type Standing = 'unknown' | 'verified' | 'review' | 'supplement' | 'draft' | 'rejected' | 'lapsed' | 'none'
const props = defineProps<{ standing: Standing; credential?: Credential; application?: Application; school?: string; busy?: boolean; reminder?: string }>()
defineEmits<{ resume: []; profile: []; start: []; refresh: [] }>()
const { t, te } = useI18n()
const format = useFormat()

const looks: Record<Exclude<Standing, 'unknown'>, { icon: Component; tone: string }> = {
  verified: { icon: BadgeCheck, tone: 'success' },
  review: { icon: Hourglass, tone: 'warning' },
  supplement: { icon: FilePenLine, tone: 'warning' },
  draft: { icon: CircleDashed, tone: 'info' },
  rejected: { icon: ShieldX, tone: 'danger' },
  lapsed: { icon: ShieldAlert, tone: 'warning' },
  none: { icon: ShieldCheck, tone: 'neutral' },
}
const look = computed(() => (props.standing === 'unknown' ? undefined : looks[props.standing]))
const label = (prefix: string, code: string) => (te(`${prefix}.${code}`) ? t(`${prefix}.${code}`) : '')
// Who and how, in one line: school, identity, method. A study stage the school does not record is left out.
const facts = computed(() => {
  const source = props.standing === 'verified' ? props.credential : props.application
  if (!source) return ''
  return [props.school, label('verification.kinds', source.kind === 'unknown' ? '' : source.kind), source.stage === 'unknown' ? '' : label('verification.stages', source.stage), label('verification.methods', source.method)].filter(Boolean).join(' · ')
})
</script>

<template>
  <section
    class="card standing"
    :class="look ? `tone-${look.tone}` : ''"
    :aria-label="t('verification.statusTitle')"
    :aria-busy="standing === 'unknown' || undefined"
  >
    <template v-if="look">
      <span
        class="standing-icon"
        aria-hidden="true"
      ><component :is="look.icon" /></span>
      <div class="standing-copy">
        <h2 class="standing-title">
          {{ t(`verification.status.${standing}.title`) }}
        </h2>
        <p class="muted">
          {{ t(`verification.status.${standing}.text`) }}
        </p>
        <p
          v-if="facts"
          class="small standing-facts"
        >
          {{ facts }}<template v-if="standing === 'verified' && credential">
            · <span class="mono">{{ credential.student_display }}</span>
          </template>
        </p>
        <p
          v-if="standing === 'verified' && credential"
          class="subtle"
        >
          <time :datetime="credential.verified_at">{{ t('verification.verifiedAt', { time: format.dateTime(credential.verified_at) }) }}</time> · {{ credential.expires_at ? t('verification.expiresAt', { time: format.dateTime(credential.expires_at) }) : t('verification.permanent') }}
        </p>
        <!-- The reviewer's own words explain a rejection or a request for more material. -->
        <p
          v-if="application?.review_note && (standing === 'rejected' || standing === 'supplement')"
          class="notice standing-note"
        >
          <b>{{ t('verification.status.reviewNote') }}</b><span>{{ application.review_note }}</span>
        </p>
        <p
          v-if="reminder"
          class="small notice notice-warning"
        >
          {{ reminder }}
        </p>
      </div>
      <div class="standing-actions">
        <button
          v-if="standing === 'verified' && credential"
          class="btn btn-sm"
          type="button"
          :disabled="busy"
          @click="$emit('profile')"
        >
          {{ t('verification.viewProfile') }}
        </button>
        <button
          v-if="standing === 'supplement' || standing === 'draft'"
          class="btn btn-sm btn-primary"
          type="button"
          :disabled="busy"
          @click="$emit('resume')"
        >
          {{ t('verification.continue') }}
        </button>
        <button
          v-if="standing === 'review'"
          class="btn btn-sm"
          type="button"
          :disabled="busy"
          @click="$emit('refresh')"
        >
          {{ t('verification.refreshStatus') }}
        </button>
        <button
          v-if="standing === 'rejected' || standing === 'lapsed'"
          class="btn btn-sm btn-primary"
          type="button"
          @click="$emit('start')"
        >
          {{ t('verification.status.restart') }}
        </button>
      </div>
    </template>
    <div
      v-else
      class="skeleton standing-skeleton"
    >
      <span class="visually-hidden">{{ t('common.loading') }}</span>
      <span aria-hidden="true" />
    </div>
  </section>
</template>

<style scoped>
.standing { --tone: var(--label-2); --tone-soft: var(--fill); display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 1rem 1.125rem; padding: clamp(1.125rem, 2vw, 1.5rem); animation: panel-in .24s var(--ease-out); }
.tone-success { --tone: var(--success); --tone-soft: var(--success-soft); }
.tone-warning { --tone: var(--warning); --tone-soft: var(--warning-soft); }
.tone-danger { --tone: var(--danger); --tone-soft: var(--danger-soft); }
.tone-info { --tone: var(--info); --tone-soft: var(--info-soft); }
.standing-icon { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; background: var(--tone-soft); color: var(--tone); }
.standing-icon svg { width: 26px; height: 26px; }
.standing-copy { display: grid; gap: .375rem; min-width: 0; }
.standing-title { font-size: clamp(1.25rem, 1.1rem + .6vw, 1.5rem); }
.standing-facts { font-weight: 550; overflow-wrap: anywhere; }
.standing-note { display: grid; justify-content: stretch; gap: .125rem; margin-block-start: .25rem; animation: none; }
.standing-note b { font-size: .8125rem; font-weight: 600; color: var(--label-2); }
.standing-actions { display: flex; flex-wrap: wrap; gap: .5rem; align-self: center; }
.standing-skeleton { grid-column: 1 / -1; }
.standing-skeleton span[aria-hidden] { height: 5.5rem; }
@media (max-width: 640px) {
  .standing { grid-template-columns: auto minmax(0, 1fr); }
  .standing-icon { width: 44px; height: 44px; }
  .standing-icon svg { width: 22px; height: 22px; }
  .standing-actions { grid-column: 1 / -1; }
  .standing-actions .btn { flex: 1 1 auto; }
}
</style>
