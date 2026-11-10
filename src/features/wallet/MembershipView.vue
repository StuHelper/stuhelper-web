<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { useAsync, useMutation } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import MeLayout from '../account/MeLayout.vue'
import { useAcademic } from '../academic/api'
import { localName, useResourcesApi, type Coverage } from '../resources/api'
import { minorText, useWalletApi, type PayAccount, type Plan } from './api'

// Membership plans and the caller's memberships. A plan only covers the resources its
// coverage lists; the name alone grants nothing, so every plan shows its actual scope.
const { t, locale } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const wallet = useWalletApi()
const resources = useResourcesApi()
const academic = useAcademic()

const mine = useAsync((signal) => wallet.memberships(signal))
const plans = useAsync((signal) => wallet.plans(signal))
void mine.reload()
void plans.reload()
const now = Date.now()
const active = (until: string) => Date.parse(until) > now

// Coverage per plan: undefined while loading, null when not configured, '' on a read failure.
const coverage = shallowRef(new Map<string, Coverage | null | string>())
const names = shallowRef(new Map<string, string>())
watch(() => plans.data.value, async (list) => {
  if (!list) return
  const next = new Map<string, Coverage | null | string>()
  await Promise.all(list.map(async (plan) => {
    try {
      next.set(plan.id, await resources.coverage(plan.id))
    } catch (failure) {
      next.set(plan.id, errorCode(failure) === 'not_found' ? null : errorCode(failure))
    }
  }))
  coverage.value = next
  await resolveNames([...next.values()].filter((value): value is Coverage => !!value && typeof value === 'object'))
})
// Names make the scope readable; a name that cannot be read falls back to a neutral label.
async function resolveNames(list: Coverage[]) {
  const rules = list.flatMap((item) => item.rules)
  const found = new Map<string, string>()
  try {
    for (const [id, object] of await academic.lookup(rules.map((rule) => rule.school_id))) found.set(id, object.name)
  } catch { /* School names are optional. */ }
  try {
    for (const category of await resources.categories()) found.set(`category:${category.id}`, localName(category.names ?? {}, locale.value))
  } catch { /* Category names are optional. */ }
  for (const school of new Set(rules.filter((rule) => rule.directory_id).map((rule) => rule.school_id))) {
    try {
      const page = await resources.directories({ school_id: school, limit: 100 })
      for (const directory of page.items) found.set(`directory:${directory.id}`, localName(directory.names ?? {}, locale.value))
    } catch { /* Directory names are optional. */ }
  }
  names.value = found
}
const ruleText = (rule: Coverage['rules'][number]) => [
  names.value.get(rule.school_id) ?? t('membership.school'),
  rule.directory_id ? names.value.get(`directory:${rule.directory_id}`) ?? t('membership.directory') : '',
  rule.category_id ? names.value.get(`category:${rule.category_id}`) ?? t('membership.category') : '',
].filter(Boolean).join(' · ')

const ivory = (minor: number) => `${minorText(minor)} Ivory`
const points = (count: number) => t('wallet.pointsAmount', { amount: format.value.number(count) })
const priceList = (plan: Plan) => [plan.points ? points(plan.points) : '', plan.ivory_minor ? ivory(plan.ivory_minor) : ''].filter(Boolean)
const days = (seconds: number) => t('membership.days', { count: format.value.number(Math.max(1, Math.round(seconds / 86400))) })

// Buying: the caller picks one account; the whole price is paid from it.
const chosen = ref<Plan>()
const account = ref<PayAccount>('points')
const write = useMutation()
const balance = useAsync((signal) => wallet.wallet(signal))
function open(plan: Plan) {
  chosen.value = plan
  account.value = plan.points ? 'points' : 'ivory'
  write.dismiss()
}
const missing = computed(() => {
  const plan = chosen.value
  const have = balance.data.value
  if (!plan || !have) return ''
  const gap = account.value === 'points' ? (plan.points ?? 0) - have.points : (plan.ivory_minor ?? 0) - have.ivory_minor
  return gap > 0 ? (account.value === 'points' ? points(gap) : ivory(gap)) : ''
})
watch(() => write.error.value, (code) => {
  if (code === 'billing_insufficient_funds') void balance.reload()
})
async function buy() {
  const plan = chosen.value
  if (!plan) return
  const order = await write.run(`membership:${plan.id}:${account.value}`, { plan_id: plan.id, account: account.value }, (body, key) => wallet.buyMembership(body, key))
  if (order) done()
}
async function retry() {
  if (await write.retry()) done()
}
function done() {
  chosen.value = undefined
  toast(t('membership.bought'))
  void mine.reload()
}
const owned = (plan: Plan) => mine.data.value?.some((item) => item.plan_id === plan.id && active(item.valid_until))
</script>

<template>
  <MeLayout
    :title="t('membership.title')"
    :description="t('membership.description')"
  >
    <section
      class="section"
      aria-labelledby="membership-mine"
    >
      <h2
        id="membership-mine"
        class="d-title"
      >
        {{ t('membership.mine') }}
      </h2>
      <AsyncState
        :status="mine.status.value"
        :error="mine.error.value"
        @retry="mine.reload"
      >
        <p
          v-if="!mine.data.value?.length"
          class="muted"
        >
          {{ t('membership.none') }}
        </p>
        <ul
          v-else
          class="group"
        >
          <li
            v-for="item in mine.data.value"
            :key="`${item.plan_id}:${item.valid_from}`"
            class="group-row"
          >
            <span class="group-body">
              <span class="group-title">{{ item.plan_name || t('membership.unnamed') }}</span>
              <span class="subtle">{{ t(active(item.valid_until) ? 'membership.until' : 'membership.ended', { date: format.dateTime(item.valid_until) }) }}</span>
            </span>
            <span
              class="tag"
              :class="active(item.valid_until) ? 'tag-success' : ''"
            >{{ t(active(item.valid_until) ? 'membership.active' : 'membership.expired') }}</span>
          </li>
        </ul>
      </AsyncState>
    </section>

    <section
      class="section"
      aria-labelledby="membership-plans"
    >
      <h2
        id="membership-plans"
        class="d-title"
      >
        {{ t('membership.plans') }}
      </h2>
      <AsyncState
        :status="plans.status.value"
        :error="plans.error.value"
        @retry="plans.reload"
      >
        <p
          v-if="!plans.data.value?.length"
          class="muted"
        >
          {{ t('membership.noPlans') }}
        </p>
        <ul
          v-else
          class="stack"
        >
          <li
            v-for="plan in plans.data.value"
            :key="plan.id"
            class="card stack-sm"
          >
            <div class="row-between">
              <b>{{ plan.name }}</b>
              <span class="subtle">{{ days(plan.valid_seconds) }}</span>
            </div>
            <p class="small">
              {{ priceList(plan).join(t('membership.alternative')) }}
            </p>
            <div class="small">
              <span class="muted">{{ t('membership.covers') }}</span>
              <p
                v-if="!coverage.has(plan.id)"
                class="subtle"
              >
                {{ t('common.loading') }}
              </p>
              <p
                v-else-if="coverage.get(plan.id) === null || (typeof coverage.get(plan.id) === 'object' && !(coverage.get(plan.id) as Coverage).rules.length)"
                class="subtle"
              >
                {{ t('membership.noCoverage') }}
              </p>
              <p
                v-else-if="typeof coverage.get(plan.id) === 'string'"
                class="subtle"
              >
                {{ t('membership.coverageUnavailable') }}
              </p>
              <ul
                v-else
                class="bullets"
              >
                <li
                  v-for="(rule, index) in (coverage.get(plan.id) as Coverage).rules"
                  :key="index"
                >
                  {{ ruleText(rule) }}
                </li>
              </ul>
            </div>
            <div class="row">
              <button
                class="btn btn-primary btn-sm"
                type="button"
                :disabled="!(coverage.get(plan.id) && typeof coverage.get(plan.id) === 'object' && (coverage.get(plan.id) as Coverage).rules.length)"
                @click="open(plan)"
              >
                {{ t(owned(plan) ? 'membership.renew' : 'membership.buy') }}
              </button>
            </div>
          </li>
        </ul>
      </AsyncState>
    </section>

    <SheetDialog
      :open="!!chosen"
      :title="chosen ? t(owned(chosen) ? 'membership.renewTitle' : 'membership.buyTitle', { name: chosen.name }) : ''"
      :description="chosen && owned(chosen) ? t('membership.renewHint') : ''"
      @close="chosen = undefined"
    >
      <form
        v-if="chosen"
        class="stack"
        @submit.prevent="void buy()"
      >
        <fieldset class="stack-sm">
          <legend class="small">
            {{ t('resources.unlock.payWith') }}
          </legend>
          <label
            v-if="chosen.points"
            class="check"
          ><input
            v-model="account"
            type="radio"
            name="membership-account"
            value="points"
          ><span>{{ points(chosen.points) }}</span></label>
          <label
            v-if="chosen.ivory_minor"
            class="check"
          ><input
            v-model="account"
            type="radio"
            name="membership-account"
            value="ivory"
          ><span>{{ ivory(chosen.ivory_minor) }}</span></label>
        </fieldset>
        <p
          v-if="write.error.value"
          class="notice notice-error"
          role="alert"
        >
          <span>{{ write.error.value === 'billing_insufficient_funds' && missing ? t('resources.unlock.short', { amount: missing }) : errorText(write.error.value) }}</span>
          <RouterLink
            v-if="write.error.value === 'billing_insufficient_funds'"
            class="btn btn-sm"
            to="/me/wallet"
          >
            {{ t('resources.unlock.toWallet') }}
          </RouterLink>
          <button
            v-else-if="write.uncertain.value"
            class="btn btn-sm"
            type="button"
            @click="void retry()"
          >
            {{ t('common.retry') }}
          </button>
        </p>
        <div class="form-actions">
          <button
            class="btn btn-primary"
            type="submit"
            :disabled="write.busy.value"
          >
            {{ t('membership.confirm', { price: account === 'points' ? points(chosen.points ?? 0) : ivory(chosen.ivory_minor ?? 0) }) }}
          </button>
        </div>
      </form>
    </SheetDialog>
  </MeLayout>
</template>

<style scoped>
fieldset { border: 0; margin: 0; padding: 0; }
.check { display: flex; align-items: center; gap: .5rem; }
.bullets { margin: .25rem 0 0; padding-inline-start: 1.25rem; list-style: disc; }
</style>
