<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Clock3, Coins, Sparkles } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import MeLayout from '../../features/account/MeLayout.vue'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { toast } from '../store'
const { t: tr } = useI18n()

const balance = ref(128)
const tab = ref<'all' | 'in' | 'out' | 'refund'>('all')
const ledger = ref([
  { id: 'l1', text: '资料审核通过奖励', sub: '自动控制原理重点公式速查', at: '10 月 30 日', n: 5, kind: 'in' },
  { id: 'l2', text: '购买 100 Ivory', sub: '微信支付 · ¥10.00', at: '10 月 12 日', n: 100, kind: 'in', refundable: true },
  { id: 'l3', text: '下载付费资料', sub: '操作系统课程设计报告模板', at: '10 月 8 日', n: -10, kind: 'out' },
  { id: 'l4', text: '评价入选优质内容', sub: '适合想做项目的同学', at: '9 月 25 日', n: 33, kind: 'in' },
])
const refunds = ref([{ id: 'f1', text: '退款 ¥5.00', steps: [tr('demo.submitted'), tr('demo.approved'), tr('demo.refunding')], at: 2 }])
const buying = ref(false)
const packs = [{ n: 50, price: 5 }, { n: 100, price: 10 }, { n: 300, price: 28 }]
const pack = ref(packs[1]!)
const refund = ref<(typeof ledger.value)[number]>()
const rows = computed(() => ledger.value.filter((r) => tab.value === 'all' || r.kind === tab.value))
function buy() { balance.value += pack.value.n; ledger.value.unshift({ id: `l${Date.now()}`, text: `购买 ${pack.value.n} Ivory`, sub: `微信支付 · ¥${pack.value.price}.00`, at: tr('demo.justNow'), n: pack.value.n, kind: 'in', refundable: true }); buying.value = false; toast(tr('demo.paySuccess')) }
function askRefund() { if (refund.value) { refund.value.refundable = false; refunds.value.unshift({ id: `f${Date.now()}`, text: tr('demo.refundAmount', { p0: refund.value.sub.split(' · ')[1] }), steps: [tr('demo.submitted'), tr('demo.approved'), tr('demo.refunding')], at: 0 }) } refund.value = undefined; tab.value = 'refund'; toast(tr('demo.refundRequested')) }
</script>

<template>
  <MeLayout :title="tr('demo.walletTitle')" :description="tr('demo.walletDescription')">
    <section class="balance">
      <div class="group-body"><span class="caption light">{{ tr('demo.balance') }}</span><p class="big"><Coins aria-hidden="true" />{{ balance }}</p><p class="row light soon"><Clock3 aria-hidden="true" />{{ tr('demo.ivoryExpiring') }}</p></div>
      <button class="btn buy" type="button" @click="buying = true">{{ tr('demo.buy') }}</button>
    </section>
    <div class="row-between"><TabBar v-model="tab" :tabs="[{ value: 'all', label: tr('demo.all') }, { value: 'in', label: tr('demo.walletEarned') }, { value: 'out', label: tr('demo.walletUsed') }, { value: 'refund', label: tr('demo.refund') }]" :label="tr('demo.ledgerKind')" id-prefix="w" /></div>
    <ul v-if="tab === 'refund'" class="list">
      <li v-for="r in refunds" :key="r.id" class="card stack">
        <b>{{ r.text }}</b>
        <ol class="steps"><li v-for="(s, i) in r.steps" :key="s" :class="{ done: i <= r.at }"><i />{{ s }}</li></ol>
        <p class="subtle">{{ tr('demo.refundEta') }}</p>
      </li>
    </ul>
    <ul v-else-if="rows.length" class="group">
      <li v-for="r in rows" :key="r.id" class="group-row">
        <span class="group-body"><span class="group-title">{{ r.text }}</span><span class="group-detail">{{ r.sub }} · {{ r.at }}</span></span>
        <button v-if="r.refundable" class="btn btn-sm btn-ghost" type="button" @click="refund = r">{{ tr('demo.refund') }}</button>
        <b class="amount" :class="{ plus: r.n > 0 }">{{ r.n > 0 ? '+' : '' }}{{ r.n }}</b>
      </li>
    </ul>
    <p v-else class="card empty">{{ tr('demo.noRecords') }}</p>

    <SheetDialog :open="buying" :title="tr('demo.buyIvory')" :description="tr('demo.buyIvoryHint')" @close="buying = false">
      <div class="packs" role="radiogroup" :aria-label="tr('demo.pickAmount')">
        <button v-for="p in packs" :key="p.n" class="pack" type="button" role="radio" :aria-checked="pack.n === p.n" @click="pack = p"><Sparkles v-if="p.n === 300" class="spark" aria-hidden="true" /><b>{{ p.n }}</b><span>¥{{ p.price }}</span></button>
      </div>
      <div class="form-actions"><button class="btn btn-primary" type="button" @click="buy">{{ tr('demo.payAmount', { p0: pack.price }) }}</button><button class="btn" type="button" @click="buying = false">{{ tr('demo.cancel') }}</button></div>
    </SheetDialog>
    <ConfirmDialog :open="!!refund" :title="tr('demo.requestRefundQ')" :message="tr('demo.refundConfirm', { p0: refund?.sub.split(' · ')[1] })" :confirm-label="tr('demo.requestRefund')" @confirm="askRefund" @cancel="refund = undefined" />
  </MeLayout>
</template>

<style scoped>
.balance { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: clamp(1.25rem, 3vw, 1.75rem); border-radius: var(--radius-lg); background: linear-gradient(135deg, #1d1d1f, #3a3a3f); color: #fff; }
.light { color: rgb(255 255 255 / 72%); }
.big { display: flex; align-items: center; gap: .5rem; font-size: clamp(2.25rem, 2rem + 1.6vw, 3rem); font-weight: 680; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.big svg { width: .8em; height: .8em; color: #ffcc4d; }
.soon { gap: .25rem; font-size: .8125rem; }
.soon svg { width: .875rem; height: .875rem; }
.buy { background: #fff; color: #1d1d1f; }
.buy:hover { background: #f0f0f2; color: #1d1d1f; }
.amount { flex: none; font-variant-numeric: tabular-nums; font-weight: 620; }
.amount.plus { color: var(--success); }
.steps { display: flex; gap: .25rem; }
.steps li { display: grid; flex: 1; gap: .3125rem; color: var(--label-3); font-size: .8125rem; }
.steps i { height: 4px; border-radius: var(--pill); background: var(--fill-strong); }
.steps li.done { color: var(--label); }
.steps li.done i { background: var(--accent-fill); }
.packs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; }
.pack { position: relative; display: grid; gap: .125rem; justify-items: center; padding: 1rem .5rem; border: 0; border-radius: var(--radius); background: var(--fill); color: var(--label); font: inherit; cursor: pointer; transition: box-shadow .2s, transform .3s var(--spring); }
.pack b { font-size: 1.375rem; font-weight: 660; }
.pack span { color: var(--label-2); font-size: .875rem; }
.pack[aria-checked="true"] { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent-fill); }
.pack:active { transform: scale(.97); }
.spark { position: absolute; inset-block-start: .5rem; inset-inline-end: .5rem; width: .875rem; height: .875rem; color: var(--c-orange); }
</style>
