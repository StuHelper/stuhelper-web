<script setup lang="ts">
import { Clock3, Coins, Sparkles } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import MeLayout from '../../features/account/MeLayout.vue'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { toast } from '../store'

const balance = ref(128)
const tab = ref<'all' | 'in' | 'out' | 'refund'>('all')
const ledger = ref([
  { id: 'l1', text: '资料审核通过奖励', sub: '自动控制原理重点公式速查', at: '10 月 30 日', n: 5, kind: 'in' },
  { id: 'l2', text: '购买 100 Ivory', sub: '微信支付 · ¥10.00', at: '10 月 12 日', n: 100, kind: 'in', refundable: true },
  { id: 'l3', text: '下载付费资料', sub: '操作系统课程设计报告模板', at: '10 月 8 日', n: -10, kind: 'out' },
  { id: 'l4', text: '评价入选优质内容', sub: '适合想做项目的同学', at: '9 月 25 日', n: 33, kind: 'in' },
])
const refunds = ref([{ id: 'f1', text: '退款 ¥5.00', steps: ['已提交', '审核通过', '退回中'], at: 2 }])
const buying = ref(false)
const packs = [{ n: 50, price: 5 }, { n: 100, price: 10 }, { n: 300, price: 28 }]
const pack = ref(packs[1]!)
const refund = ref<(typeof ledger.value)[number]>()
const rows = computed(() => ledger.value.filter((r) => tab.value === 'all' || r.kind === tab.value))
function buy() { balance.value += pack.value.n; ledger.value.unshift({ id: `l${Date.now()}`, text: `购买 ${pack.value.n} Ivory`, sub: `微信支付 · ¥${pack.value.price}.00`, at: '刚刚', n: pack.value.n, kind: 'in', refundable: true }); buying.value = false; toast('支付成功，Ivory 已到账') }
function askRefund() { if (refund.value) { refund.value.refundable = false; refunds.value.unshift({ id: `f${Date.now()}`, text: `退款 ${refund.value.sub.split(' · ')[1]}`, steps: ['已提交', '审核通过', '退回中'], at: 0 }) } refund.value = undefined; tab.value = 'refund'; toast('退款申请已提交') }
</script>

<template>
  <MeLayout title="积分与 Ivory" description="贡献内容获得奖励，也可以购买。Ivory 用于下载部分付费资料。">
    <section class="balance">
      <div class="group-body"><span class="caption light">当前余额</span><p class="big"><Coins aria-hidden="true" />{{ balance }}</p><p class="row light soon"><Clock3 aria-hidden="true" />20 Ivory 将于 11 月 30 日到期</p></div>
      <button class="btn buy" type="button" @click="buying = true">购买</button>
    </section>
    <div class="row-between"><TabBar v-model="tab" :tabs="[{ value: 'all', label: '全部' }, { value: 'in', label: '获得' }, { value: 'out', label: '使用' }, { value: 'refund', label: '退款' }]" label="明细分类" id-prefix="w" /></div>
    <ul v-if="tab === 'refund'" class="list">
      <li v-for="r in refunds" :key="r.id" class="card stack">
        <b>{{ r.text }}</b>
        <ol class="steps"><li v-for="(s, i) in r.steps" :key="s" :class="{ done: i <= r.at }"><i />{{ s }}</li></ol>
        <p class="subtle">通常 1-3 个工作日退回原支付账户。</p>
      </li>
    </ul>
    <ul v-else-if="rows.length" class="group">
      <li v-for="r in rows" :key="r.id" class="group-row">
        <span class="group-body"><span class="group-title">{{ r.text }}</span><span class="group-detail">{{ r.sub }} · {{ r.at }}</span></span>
        <button v-if="r.refundable" class="btn btn-sm btn-ghost" type="button" @click="refund = r">退款</button>
        <b class="amount" :class="{ plus: r.n > 0 }">{{ r.n > 0 ? '+' : '' }}{{ r.n }}</b>
      </li>
    </ul>
    <p v-else class="card empty">这里还没有记录。</p>

    <SheetDialog :open="buying" title="购买 Ivory" description="购买的 Ivory 一年内有效，未使用部分可以申请退款。" @close="buying = false">
      <div class="packs" role="radiogroup" aria-label="选择数量">
        <button v-for="p in packs" :key="p.n" class="pack" type="button" role="radio" :aria-checked="pack.n === p.n" @click="pack = p"><Sparkles v-if="p.n === 300" class="spark" aria-hidden="true" /><b>{{ p.n }}</b><span>¥{{ p.price }}</span></button>
      </div>
      <div class="form-actions"><button class="btn btn-primary" type="button" @click="buy">支付 ¥{{ pack.price }}</button><button class="btn" type="button" @click="buying = false">取消</button></div>
    </SheetDialog>
    <ConfirmDialog :open="!!refund" title="申请退款？" :message="`将退回 ${refund?.sub.split(' · ')[1]}，对应的 Ivory 会被扣除。`" confirm-label="申请退款" @confirm="askRefund" @cancel="refund = undefined" />
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
.spark { position: absolute; inset-block-start: .5rem; inset-inline-end: .5rem; width: .875rem; height: .875rem; color: #ff9500; }
</style>
