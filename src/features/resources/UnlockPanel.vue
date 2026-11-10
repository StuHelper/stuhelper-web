<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { useAsync, useMutation } from '../../shared/composables/async'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import { finalStates, minorText, useWalletApi, type Order, type PayAccount } from '../wallet/api'

// Buy access to one restricted resource. Paying and receiving access are two steps:
// billing takes the payment, then the resources module grants access. The panel only
// reports success once access is granted, and reports a refund when the resource can no
// longer be delivered.
const props = defineProps<{ resourceId: string }>()
const emit = defineEmits<{ unlocked: [] }>()
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const wallet = useWalletApi()

const price = useAsync((signal) => wallet.resourcePrice(props.resourceId, signal))
const balance = useAsync((signal) => wallet.wallet(signal))
void price.reload()
const accounts = computed<PayAccount[]>(() => {
  const value = price.data.value
  if (!value) return []
  return [...(value.points ? ['points' as const] : []), ...(value.ivory_minor ? ['ivory' as const] : [])]
})
const account = ref<PayAccount>('points')
watch(accounts, (list) => {
  if (list.length && !list.includes(account.value)) account.value = list[0]!
}, { immediate: true })
// Ivory is a product name and stays untranslated, as on the wallet page.
const ivory = (minor: number) => `${minorText(minor)} Ivory`
const priceText = (kind: PayAccount) => (kind === 'points' ? t('wallet.pointsAmount', { amount: format.value.number(price.data.value?.points ?? 0) }) : ivory(price.data.value?.ivory_minor ?? 0))

const write = useMutation()
const order = ref<Order>()
const waiting = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let stopped = false
onBeforeUnmount(() => {
  stopped = true
  clearTimeout(timer)
})

// Missing amount for an insufficient balance, from the server's price and balance.
const missing = computed(() => {
  const value = price.data.value
  const have = balance.data.value
  if (!value || !have) return ''
  if (account.value === 'points') {
    const gap = (value.points ?? 0) - have.points
    return gap > 0 ? t('wallet.pointsAmount', { amount: format.value.number(gap) }) : ''
  }
  const gap = (value.ivory_minor ?? 0) - have.ivory_minor
  return gap > 0 ? ivory(gap) : ''
})
watch(() => write.error.value, (code) => {
  if (code === 'billing_insufficient_funds') void balance.reload()
  if (code === 'billing_already_accessible') emit('unlocked')
})

async function buy() {
  const result = await write.run(`unlock:${props.resourceId}:${account.value}`, { resource_id: props.resourceId, account: account.value }, (body, key) => wallet.unlockResource(body, key))
  if (result) follow(result)
}
async function retry() {
  const result = await write.retry()
  if (result) follow(result as Order)
}

// Poll the order until access is granted or the payment is returned; wait up to about a minute.
function follow(current: Order, attempt = 0) {
  order.value = current
  if (current.state === 'fulfilled') {
    waiting.value = false
    toast(t('resources.unlock.done'))
    emit('unlocked')
    return
  }
  if (finalStates.includes(current.state)) {
    waiting.value = false
    return
  }
  waiting.value = true
  if (attempt >= 12 || stopped) return
  timer = setTimeout(() => {
    wallet.order(current.id).then((next) => follow(next, attempt + 1), (failure) => {
      // Keep the paid order on screen; a failed status read does not mean the purchase failed.
      if (errorCode(failure) && attempt + 1 < 12) follow(current, attempt + 1)
    })
  }, Math.min(1000 * 2 ** Math.min(attempt, 3), 5000))
}
const pending = computed(() => order.value && !finalStates.includes(order.value.state))
</script>

<template>
  <section
    class="card stack"
    aria-labelledby="unlock-title"
  >
    <h2
      id="unlock-title"
      class="d-title"
    >
      {{ t('resources.unlock.title') }}
    </h2>
    <p class="muted small">
      {{ t('resources.unlock.hint') }}
    </p>
    <p
      v-if="price.status.value === 'loading'"
      class="subtle"
    >
      {{ t('common.loading') }}
    </p>
    <ErrorNotice
      v-else-if="price.status.value === 'error'"
      :code="price.error.value"
      @retry="price.reload"
    />
    <template v-else-if="accounts.length && !order">
      <fieldset class="stack-sm">
        <legend class="small">
          {{ t('resources.unlock.payWith') }}
        </legend>
        <label
          v-for="kind in accounts"
          :key="kind"
          class="check"
        >
          <input
            v-model="account"
            type="radio"
            name="unlock-account"
            :value="kind"
          >
          <span>{{ priceText(kind) }}</span>
        </label>
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
      <div class="row">
        <button
          class="btn btn-primary"
          type="button"
          :disabled="write.busy.value"
          @click="void buy()"
        >
          {{ t('resources.unlock.buy', { price: priceText(account) }) }}
        </button>
      </div>
    </template>
    <p
      v-else-if="!accounts.length"
      class="notice notice-info"
    >
      {{ t('resources.unlock.noPrice') }}
    </p>
    <template v-if="order">
      <p
        v-if="pending"
        class="notice notice-info"
        role="status"
      >
        {{ waiting ? t('resources.unlock.granting') : t('resources.unlock.paid') }}
        <RouterLink
          class="btn btn-sm"
          to="/me/wallet"
        >
          {{ t('resources.unlock.viewOrder') }}
        </RouterLink>
      </p>
      <p
        v-else-if="order.state === 'refunded'"
        class="notice notice-warning"
        role="alert"
      >
        {{ t('resources.unlock.refunded') }}
      </p>
      <p
        v-else-if="order.state !== 'fulfilled'"
        class="notice notice-error"
        role="alert"
      >
        {{ t(`wallet.state.${order.state}`) }}
      </p>
    </template>
  </section>
</template>

<style scoped>
fieldset { border: 0; margin: 0; padding: 0; }
.check { display: flex; align-items: center; gap: .5rem; }
</style>
