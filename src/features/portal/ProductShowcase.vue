<script setup lang="ts">
import { Check, GraduationCap, ShoppingBag, Waypoints } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { products } from '../../app/products'
import { dimensions } from '../academic/api'
import RatingIcon from '../academic/RatingIcon.vue'
import { vReveal } from '../../shared/ui/reveal'

// Decorative product pictures for the promotional pages. The campus picture
// uses the same rating symbols and wording as the real course pages.
const props = defineProps<{ kind: 'campus' | 'api' | 'store' | 'sso' }>()
const { t } = useI18n()
const levels = [5, 4, 4, 3, 4]
const models = ['claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-4o', 'gemini-2.5-pro', 'deepseek-chat']
// The picture makes the product's point: the request stays the same and only
// the model name changes. The selected model moves on every few seconds.
const selected = ref(1)
const code = computed<[string, string][][]>(() => [
  [['k', 'client'], ['', '.messages.'], ['f', 'create'], ['', '(']],
  [['', '  model='], ['s model', `"${models[selected.value]}"`], ['', ',']],
  [['', '  messages=[{'], ['s', '"role"'], ['', ': '], ['s', '"user"'], ['', ', ...}],']],
  [['', ')']],
])
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  if (props.kind !== 'api' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  timer = setInterval(() => { selected.value = (selected.value + 1) % models.length }, 2600)
})
onBeforeUnmount(() => clearInterval(timer))
const order = { plan: 'ChatGPT Plus', price: '¥132' }
const account = 'student@example.edu'
</script>

<template>
  <div
    v-reveal
    class="win"
    :class="kind"
    aria-hidden="true"
  >
    <div class="bar">
      <i /><i /><i />
    </div>

    <div
      v-if="kind === 'campus'"
      class="body"
    >
      <div class="title">
        {{ t('portal.showcase.course') }}
      </div>
      <div class="meters">
        <div
          v-for="(name, index) in dimensions"
          :key="name"
          class="meter step"
          :style="{ '--i': index }"
        >
          <span class="meter-name">{{ t(`academic.ratings.${name}.label`) }}</span>
          <span class="meter-value">
            <RatingIcon
              :dimension="index"
              :level="levels[index] ?? 3"
            />{{ t(`academic.ratings.${name}.level${levels[index] ?? 3}`) }}
          </span>
        </div>
      </div>
      <div class="lines">
        <i style="width: 92%" /><i style="width: 78%" /><i style="width: 56%" />
      </div>
    </div>

    <div
      v-else-if="kind === 'api'"
      class="body"
    >
      <pre
        dir="ltr"
      ><template
        v-for="(line, row) in code"
        :key="row"
      ><span
        v-for="(token, index) in line"
        :key="token[0] === 's model' ? token[1] : index"
        :class="token[0]"
      >{{ token[1] }}</span>{{ '\n' }}</template></pre>
      <div
        class="models"
        dir="ltr"
      >
        <span
          v-for="(model, index) in models"
          :key="model"
          :class="{ on: index === selected }"
        >{{ model }}</span>
      </div>
    </div>

    <div
      v-else-if="kind === 'sso'"
      class="body login"
    >
      <img
        src="/brand.png"
        alt=""
        width="40"
        height="40"
      >
      <div class="title login-title">
        {{ t('portal.showcase.signIn') }}
      </div>
      <div
        class="field-mock"
        dir="ltr"
      >
        {{ account }}
      </div>
      <div class="btn-mock">
        {{ t('portal.showcase.continue') }}
      </div>
      <div class="hint">
        {{ t('portal.showcase.oneAccount') }}
      </div>
      <div class="apps">
        <span
          class="step"
          style="--c: #2d5bff; --i: 0"
        ><GraduationCap />{{ t('nav.campus') }}</span>
        <span
          class="step"
          style="--c: #7a4de8; --i: 1"
        ><Waypoints />{{ products.api.name }}</span>
        <span
          class="step"
          style="--c: #0d9467; --i: 2"
        ><ShoppingBag />{{ products.store.name }}</span>
      </div>
    </div>

    <div
      v-else
      class="body"
    >
      <div class="order">
        <div>
          <div class="title">
            {{ order.plan }}
          </div>
          <div class="order-note">
            {{ t('portal.showcase.order') }}
          </div>
        </div>
        <div class="price">
          {{ order.price }}
        </div>
      </div>
      <div class="track">
        <i />
      </div>
      <div class="steps">
        <span
          v-for="step in 4"
          :key="step"
          :class="{ done: step < 4 }"
          :style="{ '--i': step - 1 }"
        ><Check v-if="step < 4" /></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The picture leans a little towards the pointer; --rx and --ry come from the surrounding art area. */
.win { width: min(500px, 100%); overflow: hidden; border-radius: 22px; background: var(--surface-raised); box-shadow: 0 30px 80px -20px rgb(0 0 0 / 28%), 0 0 0 .5px var(--separator); text-align: start; transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform .5s var(--ease-out); will-change: transform; }
.bar { display: flex; gap: 6px; padding: 14px 16px 6px; }
.bar i { width: 10px; height: 10px; border-radius: 50%; background: var(--fill-strong); }
.body { display: flex; flex-direction: column; gap: 18px; padding: 14px 26px 30px; }
.title { font-size: 1.5rem; font-weight: 750; }
/* Parts marked .step appear one after another once the picture is in view. */
.step { opacity: 0; translate: 0 8px; transition: opacity .5s var(--ease-out), translate .5s var(--ease-out); transition-delay: calc(.25s + var(--i, 0) * 90ms); }
.in .step { opacity: 1; translate: none; }
.meters { display: grid; gap: 10px; }
.meter { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: .875rem; }
.meter-name { color: var(--label-3); }
.meter-value { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.lines { display: grid; gap: 8px; }
.lines i { height: 10px; border-radius: 5px; background: var(--fill); transform: scaleX(0); transform-origin: left; transition: transform .8s var(--ease-out) .7s; }
[dir="rtl"] .lines i { transform-origin: right; }
.lines i:nth-child(2) { transition-delay: .8s; }
.lines i:nth-child(3) { transition-delay: .9s; }
.in .lines i { transform: none; }
pre { margin: 0; font: .875rem/1.9 var(--mono); white-space: pre-wrap; }
.k { color: var(--c-blue); }
.f { color: var(--c-purple); }
.s { color: var(--success); }
.model { display: inline-block; animation: swap .45s var(--ease-out); }
@keyframes swap { from { opacity: 0; transform: translateY(6px); filter: blur(3px); } }
.models { display: flex; flex-wrap: wrap; gap: 8px; }
.models span { padding: 5px 11px; border-radius: var(--pill); background: var(--fill); color: var(--label-3); font: .78rem var(--mono); transition: background-color .4s, color .4s, transform .5s var(--spring); }
.models span.on { background: #7a4de8; color: #fff; transform: scale(1.06); }
.order { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.order-note { color: var(--label-3); font-size: .875rem; }
.price { font-size: 2.125rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.track { height: 10px; overflow: hidden; border-radius: var(--pill); background: var(--fill); }
.track i { display: block; width: 8%; height: 100%; border-radius: var(--pill); background: #0d9467; transition: width 2.2s var(--ease-out) .3s; }
.in .track i { width: 78%; }
.steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.steps span { display: grid; place-items: center; height: 34px; border-radius: 12px; background: var(--fill); transition: background-color .4s, color .4s; transition-delay: calc(.5s + var(--i, 0) * .45s); }
.in .steps span.done { background: color-mix(in srgb, #0d9467 14%, transparent); color: #0d9467; }
.steps svg { width: 16px; height: 16px; opacity: 0; scale: .3; transition: opacity .3s, scale .5s var(--spring); transition-delay: calc(.5s + var(--i, 0) * .45s); }
.in .steps svg { opacity: 1; scale: 1; }
.win.sso { width: min(360px, 100%); }
.win.sso .bar { display: none; }
.login { align-items: center; gap: 14px; padding-block-start: 34px; }
.login img { border-radius: 10px; object-fit: contain; }
.login-title { font-size: 1.25rem; }
.field-mock { display: flex; align-items: center; width: 100%; height: 44px; padding-inline: 14px; border-radius: 12px; background: var(--fill); color: var(--label-2); font-size: .875rem; }
.btn-mock { position: relative; display: grid; place-items: center; width: 100%; height: 44px; overflow: hidden; border-radius: var(--pill); background: #2d5bff; color: #fff; font-weight: 600; }
.btn-mock::after { content: ""; position: absolute; inset-block: 0; inset-inline-start: -60%; width: 50%; background: linear-gradient(100deg, transparent, rgb(255 255 255 / 28%), transparent); }
.in .btn-mock::after { animation: sheen 3.6s ease-in-out 1s infinite; }
@keyframes sheen { 0%, 60% { transform: none; } 100% { transform: translateX(420%); } }
[dir="rtl"] .in .btn-mock::after { animation-name: sheen-rtl; }
@keyframes sheen-rtl { 0%, 60% { transform: none; } 100% { transform: translateX(-420%); } }
.hint { color: var(--label-3); font-size: .8125rem; }
.apps { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; width: 100%; margin-block-start: 8px; padding-block-start: 18px; border-block-start: .5px solid var(--separator); }
.apps span { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding-inline: 11px; border-radius: var(--pill); background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--c); font-size: .8125rem; font-weight: 600; }
.apps svg { width: 14px; height: 14px; }
@media (prefers-reduced-motion: reduce) {
  .step, .steps svg { opacity: 1; translate: none; scale: 1; }
  .lines i { transform: none; }
  .track i { width: 78%; }
  .steps span.done { background: color-mix(in srgb, #0d9467 14%, transparent); color: #0d9467; }
  .btn-mock::after { display: none; }
}
</style>
