<script setup lang="ts">
import { Clock3, Coins, Sparkles } from 'lucide-vue-next'
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { isolate } from '../../shared/format'
import { errorCode } from '../../shared/api/errors'
import { useAsync, useMutation, usePaged } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import MeLayout from '../account/MeLayout.vue'
import { expiringPoints, finalStates, minorText, parseIvory, useWalletApi, type Channel, type Entry, type Offer, type Order } from './api'

// Points and Ivory: balances, what expires, the ledger and orders. Every write is
// confirmed by the user first and sent with an idempotency key, so a repeated tap
// or a retried request never charges twice. Only channels and offers the server
// reports as enabled get an entry point.
const { t, te } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const api = useWalletApi()

const summary = useAsync(async (signal) => {
  const [wallet, lots, channels, offers] = await Promise.all([api.wallet(signal), api.pointLots(signal), api.channels(signal), api.offers(signal)])
  return { wallet, expiring: expiringPoints(lots).slice(0, 3), channels: channels.items.filter((item) => item.enabled), offers: offers.items.filter((item) => item.enabled) }
})
void summary.reload()

const ivory = (minor: number) => format.value.number(Number(minorText(minor)), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cny = (minor: number) => format.value.currency(minorText(minor), 'CNY')
const points = (value: number) => format.value.number(value)
const label = (key: string, fallback: string) => (te(key) ? t(key) : fallback)
// Channel ids are configured by operators and shown as configured.
const channelName = (id: string) => id

type Tab = 'ledger' | 'orders'
const tab = ref<Tab>('ledger')
const tabs = computed(() => [{ value: 'ledger' as const, label: t('wallet.tabs.ledger') }, { value: 'orders' as const, label: t('wallet.tabs.orders') }])
const ledger = usePaged<Entry>((after, signal) => api.ledger(after, signal))
const orders = usePaged<Order>((after, signal) => api.orders(after, signal))
watch(tab, (value) => void (value === 'ledger' ? ledger.reload() : orders.reload()), { immediate: true })
function refreshAll() {
  void summary.reload()
  void (tab.value === 'ledger' ? ledger.reload() : orders.reload())
}

// Signed amounts are isolated so right-to-left text keeps the sign next to the number.
function amountText(entry: Entry) {
  const signed = entry.asset === 'ivory'
    ? format.value.number(entry.amount / 100, { signDisplay: 'exceptZero', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : format.value.number(entry.amount, { signDisplay: 'exceptZero' })
  return entry.asset === 'ivory' ? `${isolate(signed)} Ivory` : t('wallet.pointsAmount', { amount: isolate(signed) })
}
const stateTone = (state: Order['state']) => (state === 'succeeded' ? 'success' : state === 'failed' || state === 'rejected' ? 'danger' : finalStates.includes(state) ? 'neutral' : 'info')
function orderTitle(order: Order) {
  if (order.kind === 'topup') return t('wallet.orderTitle.topup', { amount: ivory(order.amount_minor) })
  if (order.kind === 'purchase') return t('wallet.orderTitle.purchase', { points: points(order.points) })
  return t(`wallet.orderTitle.${order.kind}`, { amount: ivory(order.amount_minor) })
}

// Top-up: choose a configured channel and amount, confirm the price, then follow the
// payment instruction until the provider confirms the result.
const topupOpen = ref(false)
const channel = ref('')
const amount = ref(0)
const topupWrite = useMutation()
const paying = shallowRef<Order>()
const qr = ref('')
const channels = computed<Channel[]>(() => summary.data.value?.channels ?? [])
const amounts = computed(() => channels.value.find((item) => item.id === channel.value)?.amounts_minor ?? [])
function openTopup() {
  channel.value = channels.value[0]?.id ?? ''
  amount.value = amounts.value[0] ?? 0
  paying.value = undefined
  topupOpen.value = true
}
watch(channel, () => {
  if (!amounts.value.includes(amount.value)) amount.value = amounts.value[0] ?? 0
})
async function submitTopup() {
  const order = await topupWrite.run(`topup:${channel.value}:${amount.value}`, { channel: channel.value, amount_minor: amount.value }, (body, key) => api.topup(body, key))
  if (order) follow(order)
}
async function retryTopup() {
  const order = await topupWrite.retry()
  // The retried request is the original top-up and returns the same Order.
  if (order) follow(order as Order)
}
async function follow(order: Order) {
  paying.value = order
  qr.value = order.payment_instruction?.type === 'qr_code' ? await QRCode.toDataURL(order.payment_instruction.content, { margin: 1, width: 240 }) : ''
  if (finalStates.includes(order.state)) settled(order)
}
function resume(order: Order) {
  channel.value = order.channel
  amount.value = order.amount_minor
  topupOpen.value = true
  void follow(order)
}
const checking = ref(false)
const checkError = ref('')
async function check(manual: boolean) {
  const order = paying.value
  if (!order || checking.value) return
  checking.value = true
  if (manual) checkError.value = ''
  try {
    const current = await api.refresh(order.id, crypto.randomUUID())
    paying.value = current
    if (finalStates.includes(current.state)) settled(current)
  } catch (failure) {
    if (manual) checkError.value = errorCode(failure)
  } finally {
    checking.value = false
  }
}
// The provider result arrives asynchronously; ask again every few seconds while the sheet is open.
const timer = setInterval(() => {
  if (topupOpen.value && paying.value?.state === 'awaiting_payment') void check(false)
}, 4000)
onBeforeUnmount(() => clearInterval(timer))
const cancelWrite = useMutation()
async function cancelPayment() {
  const order = paying.value
  if (!order) return
  const result = await cancelWrite.run(`cancel:${order.id}`, undefined, (_, key) => api.cancel(order.id, key))
  if (result) settled(result)
}
function settled(order: Order) {
  paying.value = order
  refreshAll()
  if (order.state === 'succeeded') toast(t('wallet.topup.credited', { amount: ivory(order.amount_minor) }))
}
function closeTopup() {
  if (topupWrite.busy.value || topupWrite.uncertain.value) return
  topupOpen.value = false
  paying.value = undefined
  qr.value = ''
}

// Points: spend Ivory on a configured offer after confirming price, points and validity.
const buyOpen = ref(false)
const offer = shallowRef<Offer>()
const buyWrite = useMutation()
const enough = (item: Offer) => (summary.data.value?.wallet.ivory_minor ?? 0) >= item.amount_minor
const validity = (item: Offer) => (item.valid_seconds ? t('wallet.buy.validUntil', { date: format.value.date(Date.now() + item.valid_seconds * 1000) }) : t('wallet.buy.noExpiry'))
function openBuy() {
  offer.value = summary.data.value?.offers.find(enough) ?? summary.data.value?.offers[0]
  buyOpen.value = true
}
async function submitBuy() {
  const chosen = offer.value
  if (!chosen) return
  const order = await buyWrite.run(`purchase:${chosen.id}:${chosen.version}`, { offer_id: chosen.id, version: chosen.version }, (body, key) => api.purchase(body, key))
  if (order) bought(order)
}
async function retryBuy() {
  const order = await buyWrite.retry()
  if (order) bought(order as Order)
}
function bought(order: Order) {
  refreshAll()
  if (order.state === 'succeeded') {
    buyOpen.value = false
    toast(t('wallet.buy.done', { points: points(order.points) }))
  } else {
    // A rejected or still-processing purchase stays visible with its state.
    buyOpen.value = false
    toast(t(`wallet.state.${order.state}`))
  }
}

// Refund of a top-up: the amount may not exceed the paid amount; the server checks
// the refundable balance and the refund then follows review and payout states.
const refunding = shallowRef<Order>()
const refundAmount = ref('')
const refundReason = ref('')
const refundWrite = useMutation()
const refundMinor = computed(() => parseIvory(refundAmount.value))
const refundError = computed(() => {
  if (!refundAmount.value.trim()) return ''
  const value = refundMinor.value
  if (value === undefined || value <= 0) return t('wallet.refund.invalidAmount')
  return refunding.value && value > refunding.value.amount_minor ? t('wallet.refund.tooMuch', { amount: ivory(refunding.value.amount_minor) }) : ''
})
function openRefund(order: Order) {
  refunding.value = order
  refundAmount.value = minorText(order.amount_minor)
  refundReason.value = ''
}
async function submitRefund() {
  const order = refunding.value
  const minor = refundMinor.value
  if (!order || minor === undefined || refundError.value || !refundReason.value.trim()) return
  const result = await refundWrite.run(`refund:${order.id}`, { topup_id: order.id, amount_minor: minor, reason: refundReason.value.trim() }, (body, key) => api.refund(body, key))
  if (result) refunded()
}
async function retryRefund() {
  if (await refundWrite.retry()) refunded()
}
function refunded() {
  refunding.value = undefined
  tab.value = 'orders'
  refreshAll()
  toast(t('wallet.refund.submitted'))
}

// Manual refunds ask the user for a receiving account reference after review.
const receiptFor = shallowRef<Order>()
const receipt = ref('')
const receiptWrite = useMutation()
async function submitReceipt() {
  const order = receiptFor.value
  if (!order || !receipt.value.trim()) return
  const result = await receiptWrite.run(`receipt:${order.id}`, { receipt_reference: receipt.value.trim() }, (body, key) => api.receipt(order.id, body, key))
  if (result) receiptDone()
}
async function retryReceipt() {
  if (await receiptWrite.retry()) receiptDone()
}
function receiptDone() {
  receiptFor.value = undefined
  receipt.value = ''
  refreshAll()
  toast(t('wallet.receipt.submitted'))
}
const refundable = (order: Order) => order.kind === 'topup' && order.state === 'succeeded' && channels.value.some((item) => item.id === order.channel && item.original_refunds)
</script>

<template>
  <MeLayout
    :title="t('wallet.title')"
    :description="t('wallet.description')"
  >
    <AsyncState
      :status="summary.status.value"
      :error="summary.error.value"
      @retry="summary.reload()"
    >
      <template v-if="summary.data.value">
        <p
          v-if="summary.data.value.wallet.frozen"
          class="notice notice-warning"
          role="status"
        >
          {{ t('wallet.frozen') }}
        </p>
        <section
          class="balance"
          :aria-label="t('wallet.balance')"
        >
          <div class="figure">
            <span class="caption light">{{ t('wallet.ivoryBalance') }}</span>
            <p class="big">
              <Coins aria-hidden="true" />{{ ivory(summary.data.value.wallet.ivory_minor) }}
            </p>
            <span
              v-if="summary.data.value.wallet.frozen_ivory_minor"
              class="light small"
            >{{ t('wallet.frozenIvory', { amount: ivory(summary.data.value.wallet.frozen_ivory_minor) }) }}</span>
          </div>
          <div class="figure">
            <span class="caption light">{{ t('wallet.points') }}</span>
            <p class="big">
              <Sparkles aria-hidden="true" />{{ points(summary.data.value.wallet.points) }}
            </p>
            <span
              v-if="summary.data.value.wallet.debt_points"
              class="light small"
            >{{ t('wallet.debt', { points: points(summary.data.value.wallet.debt_points) }) }}</span>
          </div>
          <div class="actions">
            <button
              v-if="channels.length"
              class="btn buy"
              type="button"
              :disabled="summary.data.value.wallet.frozen"
              @click="openTopup"
            >
              {{ t('wallet.topup.action') }}
            </button>
            <button
              v-if="summary.data.value.offers.length"
              class="btn ghost-light"
              type="button"
              :disabled="summary.data.value.wallet.frozen"
              @click="openBuy"
            >
              {{ t('wallet.buy.action') }}
            </button>
          </div>
        </section>
        <ul
          v-if="summary.data.value.expiring.length"
          class="card stack-sm expiring"
          :aria-label="t('wallet.expiringTitle')"
        >
          <li
            v-for="row in summary.data.value.expiring"
            :key="row.at"
            class="row small"
          >
            <Clock3 aria-hidden="true" />{{ t('wallet.expiring', { points: points(row.points), date: format.dateTime(row.at) }) }}
          </li>
        </ul>
        <p
          v-if="!channels.length"
          class="muted small"
        >
          {{ t('wallet.topup.unavailable') }}
        </p>
      </template>
    </AsyncState>

    <TabBar
      v-model="tab"
      :tabs="tabs"
      :label="t('wallet.tabs.label')"
      id-prefix="wallet"
    />
    <div
      :id="`wallet-panel-${tab}`"
      role="tabpanel"
      :aria-labelledby="`wallet-tab-${tab}`"
    >
      <PagedState
        v-if="tab === 'ledger'"
        :status="ledger.status.value"
        :error="ledger.error.value"
        :count="ledger.items.value.length"
        :next="ledger.next.value"
        :appending="ledger.appending.value"
        :empty-text="t('wallet.emptyLedger')"
        @retry="ledger.reload"
        @more="ledger.loadMore"
      >
        <ul class="group">
          <li
            v-for="entry in ledger.items.value"
            :key="entry.id"
            class="group-row"
          >
            <span class="group-body">
              <span class="group-title">{{ label(`wallet.entryKind.${entry.kind}`, entry.kind) }}</span>
              <span class="group-detail">{{ format.dateTime(entry.created_at) }}</span>
            </span>
            <b
              class="amount"
              :class="{ plus: entry.amount > 0 }"
            >{{ amountText(entry) }}</b>
          </li>
        </ul>
      </PagedState>
      <PagedState
        v-else
        :status="orders.status.value"
        :error="orders.error.value"
        :count="orders.items.value.length"
        :next="orders.next.value"
        :appending="orders.appending.value"
        :empty-text="t('wallet.emptyOrders')"
        @retry="orders.reload"
        @more="orders.loadMore"
      >
        <ul class="list">
          <li
            v-for="order in orders.items.value"
            :key="order.id"
            class="card stack-sm"
          >
            <div class="row-between">
              <b>{{ orderTitle(order) }}</b>
              <StatusTag :tone="stateTone(order.state)">
                {{ t(`wallet.state.${order.state}`) }}
              </StatusTag>
            </div>
            <p class="subtle">
              <template v-if="order.kind === 'topup'">
                {{ t('wallet.paid', { price: cny(order.amount_minor), channel: channelName(order.channel) }) }} ·
              </template>
              {{ format.dateTime(order.created_at) }}
            </p>
            <p
              v-if="order.reason"
              class="small muted"
            >
              {{ t('wallet.reason', { reason: order.reason }) }}
            </p>
            <p
              v-if="order.failure_code"
              class="small field-error"
            >
              {{ errorText(order.failure_code) }}
            </p>
            <div class="row">
              <button
                v-if="order.kind === 'topup' && order.state === 'awaiting_payment'"
                class="btn btn-sm btn-primary"
                type="button"
                @click="resume(order)"
              >
                {{ t('wallet.topup.resume') }}
              </button>
              <button
                v-if="refundable(order)"
                class="btn btn-sm"
                type="button"
                @click="openRefund(order)"
              >
                {{ t('wallet.refund.action') }}
              </button>
              <button
                v-if="order.kind === 'refund' && order.state === 'awaiting_details'"
                class="btn btn-sm btn-primary"
                type="button"
                @click="receiptFor = order"
              >
                {{ t('wallet.receipt.action') }}
              </button>
            </div>
          </li>
        </ul>
      </PagedState>
    </div>

    <SheetDialog
      :open="topupOpen"
      :title="t('wallet.topup.title')"
      :description="t('wallet.topup.hint')"
      @close="closeTopup"
    >
      <template v-if="!paying">
        <fieldset
          v-if="channels.length > 1"
          class="choices"
        >
          <legend class="field-label">
            {{ t('wallet.topup.channel') }}
          </legend>
          <label
            v-for="item in channels"
            :key="item.id"
            class="check"
          >
            <input
              v-model="channel"
              type="radio"
              :value="item.id"
              :disabled="topupWrite.busy.value || topupWrite.uncertain.value"
            >
            <span>{{ channelName(item.id) }}</span>
          </label>
        </fieldset>
        <fieldset class="packs">
          <legend class="field-label">
            {{ t('wallet.topup.amount') }}
          </legend>
          <label
            v-for="value in amounts"
            :key="value"
            class="pack"
          >
            <input
              v-model="amount"
              class="visually-hidden"
              type="radio"
              :value="value"
              :disabled="topupWrite.busy.value || topupWrite.uncertain.value"
            >
            <b>{{ ivory(value) }}</b>
            <span>{{ cny(value) }}</span>
          </label>
        </fieldset>
        <p class="small muted">
          {{ t('wallet.topup.confirm', { price: cny(amount), amount: ivory(amount), channel: channelName(channel) }) }}
        </p>
        <MutationNotice
          :busy="topupWrite.busy.value"
          :error="topupWrite.error.value"
          :uncertain="topupWrite.uncertain.value"
          @retry="retryTopup"
        />
        <div class="form-actions">
          <button
            class="btn btn-primary"
            type="button"
            :disabled="!amount || topupWrite.busy.value || topupWrite.uncertain.value"
            @click="submitTopup"
          >
            {{ t('wallet.topup.pay', { price: cny(amount) }) }}
          </button>
          <button
            class="btn"
            type="button"
            :disabled="topupWrite.busy.value || topupWrite.uncertain.value"
            @click="closeTopup"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
      </template>
      <div
        v-else
        class="stack"
      >
        <p
          role="status"
          class="row-between"
        >
          <span>{{ t('wallet.topup.orderAmount', { price: cny(paying.amount_minor), amount: ivory(paying.amount_minor) }) }}</span>
          <StatusTag :tone="stateTone(paying.state)">
            {{ t(`wallet.state.${paying.state}`) }}
          </StatusTag>
        </p>
        <template v-if="paying.state === 'awaiting_payment' && paying.payment_instruction">
          <img
            v-if="qr"
            class="qr"
            :src="qr"
            :alt="t('wallet.topup.qrAlt', { channel: channelName(paying.channel) })"
          >
          <a
            v-else
            class="btn btn-primary"
            :href="paying.payment_instruction.content"
            target="_blank"
            rel="noopener noreferrer"
          >{{ t('wallet.topup.openPayment', { channel: channelName(paying.channel) }) }}</a>
          <p class="small muted">
            {{ t('wallet.topup.expires', { time: format.dateTime(paying.payment_instruction.expires_at) }) }}
          </p>
        </template>
        <p
          v-if="checkError"
          class="field-error"
          role="alert"
        >
          {{ errorText(checkError) }}
        </p>
        <MutationNotice
          :busy="cancelWrite.busy.value"
          :error="cancelWrite.error.value"
          :uncertain="cancelWrite.uncertain.value"
          @retry="cancelWrite.retry"
        />
        <div class="form-actions">
          <button
            v-if="paying.state === 'awaiting_payment' || paying.state === 'submitted' || paying.state === 'processing'"
            class="btn btn-primary"
            type="button"
            :disabled="checking"
            @click="check(true)"
          >
            {{ t('wallet.topup.check') }}
          </button>
          <button
            v-if="paying.state === 'awaiting_payment'"
            class="btn"
            type="button"
            :disabled="cancelWrite.busy.value || cancelWrite.uncertain.value"
            @click="cancelPayment"
          >
            {{ t('wallet.topup.cancelOrder') }}
          </button>
          <button
            class="btn"
            type="button"
            @click="closeTopup"
          >
            {{ t('common.close') }}
          </button>
        </div>
      </div>
    </SheetDialog>

    <SheetDialog
      :open="buyOpen"
      :title="t('wallet.buy.title')"
      :description="t('wallet.buy.hint', { amount: ivory(summary.data.value?.wallet.ivory_minor ?? 0) })"
      @close="!buyWrite.busy.value && !buyWrite.uncertain.value && (buyOpen = false)"
    >
      <fieldset class="packs">
        <legend class="visually-hidden">
          {{ t('wallet.buy.offer') }}
        </legend>
        <label
          v-for="item in summary.data.value?.offers"
          :key="item.id"
          class="pack"
          :class="{ short: !enough(item) }"
        >
          <input
            v-model="offer"
            class="visually-hidden"
            type="radio"
            :value="item"
            :disabled="!enough(item) || buyWrite.busy.value || buyWrite.uncertain.value"
          >
          <b>{{ t('wallet.pointsAmount', { amount: points(item.points) }) }}</b>
          <span>{{ t('wallet.buy.price', { amount: ivory(item.amount_minor) }) }}</span>
        </label>
      </fieldset>
      <p
        v-if="offer"
        class="notice notice-info small"
      >
        {{ t('wallet.buy.confirm', { amount: ivory(offer.amount_minor), points: points(offer.points), validity: validity(offer) }) }}
      </p>
      <MutationNotice
        :busy="buyWrite.busy.value"
        :error="buyWrite.error.value"
        :uncertain="buyWrite.uncertain.value"
        @retry="retryBuy"
      />
      <div class="form-actions">
        <button
          class="btn btn-primary"
          type="button"
          :disabled="!offer || !enough(offer) || buyWrite.busy.value || buyWrite.uncertain.value"
          @click="submitBuy"
        >
          {{ t('wallet.buy.submit') }}
        </button>
        <button
          class="btn"
          type="button"
          :disabled="buyWrite.busy.value || buyWrite.uncertain.value"
          @click="buyOpen = false"
        >
          {{ t('common.cancel') }}
        </button>
      </div>
    </SheetDialog>

    <SheetDialog
      :open="!!refunding"
      :title="t('wallet.refund.title')"
      :description="t('wallet.refund.hint')"
      @close="!refundWrite.busy.value && !refundWrite.uncertain.value && (refunding = undefined)"
    >
      <form
        class="stack"
        novalidate
        @submit.prevent="submitRefund"
      >
        <div class="field">
          <label
            class="field-label"
            for="wallet-refund-amount"
          >{{ t('wallet.refund.amount') }}</label>
          <input
            id="wallet-refund-amount"
            v-model="refundAmount"
            class="input"
            inputmode="decimal"
            autocomplete="off"
            :aria-invalid="!!refundError"
            aria-describedby="wallet-refund-amount-hint"
            :disabled="refundWrite.busy.value || refundWrite.uncertain.value"
          >
          <span
            id="wallet-refund-amount-hint"
            :class="refundError ? 'field-error' : 'field-hint'"
          >{{ refundError || t('wallet.refund.limit', { amount: ivory(refunding?.amount_minor ?? 0) }) }}</span>
        </div>
        <div class="field">
          <label
            class="field-label"
            for="wallet-refund-reason"
          >{{ t('wallet.refund.reason') }}</label>
          <textarea
            id="wallet-refund-reason"
            v-model="refundReason"
            class="textarea"
            maxlength="1000"
            :disabled="refundWrite.busy.value || refundWrite.uncertain.value"
          />
        </div>
        <MutationNotice
          :busy="refundWrite.busy.value"
          :error="refundWrite.error.value"
          :uncertain="refundWrite.uncertain.value"
          @retry="retryRefund"
        />
        <div class="form-actions">
          <button
            class="btn btn-primary"
            type="submit"
            :disabled="!refundMinor || !!refundError || !refundReason.trim() || refundWrite.busy.value || refundWrite.uncertain.value"
          >
            {{ t('wallet.refund.submit') }}
          </button>
          <button
            class="btn"
            type="button"
            :disabled="refundWrite.busy.value || refundWrite.uncertain.value"
            @click="refunding = undefined"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
      </form>
    </SheetDialog>

    <SheetDialog
      :open="!!receiptFor"
      :title="t('wallet.receipt.title')"
      :description="t('wallet.receipt.hint')"
      @close="!receiptWrite.busy.value && !receiptWrite.uncertain.value && (receiptFor = undefined)"
    >
      <form
        class="stack"
        novalidate
        @submit.prevent="submitReceipt"
      >
        <div class="field">
          <label
            class="field-label"
            for="wallet-receipt"
          >{{ t('wallet.receipt.label') }}</label>
          <input
            id="wallet-receipt"
            v-model="receipt"
            class="input"
            maxlength="256"
            autocomplete="off"
            :disabled="receiptWrite.busy.value || receiptWrite.uncertain.value"
          >
        </div>
        <MutationNotice
          :busy="receiptWrite.busy.value"
          :error="receiptWrite.error.value"
          :uncertain="receiptWrite.uncertain.value"
          @retry="retryReceipt"
        />
        <div class="form-actions">
          <button
            class="btn btn-primary"
            type="submit"
            :disabled="!receipt.trim() || receiptWrite.busy.value || receiptWrite.uncertain.value"
          >
            {{ t('common.submit') }}
          </button>
          <button
            class="btn"
            type="button"
            :disabled="receiptWrite.busy.value || receiptWrite.uncertain.value"
            @click="receiptFor = undefined"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
      </form>
    </SheetDialog>
  </MeLayout>
</template>

<style scoped>
.balance { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 1rem 2rem; padding: clamp(1.25rem, 3vw, 1.75rem); border-radius: var(--radius-lg); background: linear-gradient(135deg, #1d1d1f, #3a3a3f); color: #fff; }
.figure { display: grid; gap: .125rem; }
.light { color: rgb(255 255 255 / 72%); }
.big { display: flex; align-items: center; gap: .5rem; font-size: clamp(1.75rem, 1.5rem + 1.6vw, 2.5rem); font-weight: 680; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.big svg { width: .75em; height: .75em; color: #ffcc4d; }
.actions { display: flex; flex-wrap: wrap; gap: .5rem; margin-inline-start: auto; }
.buy { background: #fff; color: #1d1d1f; }
.buy:hover { background: #f0f0f2; color: #1d1d1f; }
.ghost-light { background: rgb(255 255 255 / 14%); color: #fff; }
.ghost-light:hover { background: rgb(255 255 255 / 22%); color: #fff; }
.expiring svg { width: 1rem; height: 1rem; color: var(--c-orange); }
.amount { flex: none; font-variant-numeric: tabular-nums; font-weight: 620; }
.amount.plus { color: var(--success); }
.choices { display: flex; flex-wrap: wrap; gap: .75rem; }
.check { display: flex; align-items: center; gap: .5rem; }
.packs { display: grid; grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr)); gap: .5rem; }
.packs legend { margin-block-end: .5rem; }
.pack { display: grid; gap: .125rem; justify-items: center; padding: 1rem .5rem; border-radius: var(--radius); background: var(--fill); cursor: pointer; transition: box-shadow .2s; }
.pack:has(input:checked) { box-shadow: inset 0 0 0 2px var(--accent); }
.pack:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.pack.short { opacity: .5; cursor: not-allowed; }
.pack span { color: var(--label-2); font-size: .8125rem; }
.qr { width: min(240px, 100%); margin-inline: auto; border-radius: var(--radius); background: #fff; }
</style>
