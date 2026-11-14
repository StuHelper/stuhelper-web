<script setup lang="ts">
import { Activity, ArrowUpRight, Boxes, Coins, CreditCard, FileCheck2, KeyRound, MessageSquare, PackageCheck, RefreshCw, ScanSearch, Sparkles, Waypoints } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { products } from '../../app/products'
import { vTilt } from '../../shared/ui/pointer'
import { vReveal } from '../../shared/ui/reveal'
import ProductShowcase from './ProductShowcase.vue'
import '../../styles/landing.css'

// Introduction of a product that runs on its own site. Ordering, consoles and
// accounts of that product live there; this page explains and links out.
const props = defineProps<{ product: 'api' | 'store' }>()
const { t } = useI18n()
const points = {
  api: [
    { key: 'protocols', icon: Waypoints },
    { key: 'tokens', icon: KeyRound },
    { key: 'usage', icon: Activity },
    { key: 'models', icon: Boxes },
    { key: 'playground', icon: MessageSquare },
    { key: 'wallet', icon: CreditCard },
  ],
  store: [
    { key: 'gpt', icon: Sparkles },
    { key: 'codex', icon: Coins },
    { key: 'check', icon: ScanSearch },
    { key: 'upgrade', icon: RefreshCw },
    { key: 'progress', icon: PackageCheck },
    { key: 'receipts', icon: FileCheck2 },
  ],
}
const site = computed(() => products[props.product])
</script>

<template>
  <div class="lp product">
    <section class="lp-split product-hero">
      <div class="lp-enter">
        <h1 class="lp-h1">
          {{ site.fullName }}
        </h1>
        <p class="lp-tag">
          {{ t(`portal.${product}.tag`) }}
        </p>
        <p class="lp-lead">
          {{ t(`portal.${product}.lead`) }}
        </p>
        <div class="lp-cta">
          <a
            class="btn btn-primary"
            :href="site.url"
            target="_blank"
            rel="noopener"
          >{{ t('portal.visit', { host: site.host }) }}<ArrowUpRight aria-hidden="true" /></a>
        </div>
      </div>
      <div
        v-tilt
        class="lp-art lp-enter-art"
      >
        <ProductShowcase :kind="product" />
      </div>
    </section>
    <ul
      v-reveal
      class="lp-cards lp-reveal"
    >
      <li
        v-for="point in points[product]"
        :key="point.key"
        class="lp-card"
      >
        <component
          :is="point.icon"
          aria-hidden="true"
        />
        <b>{{ t(`portal.${product}.points.${point.key}.title`) }}</b>
        <p>{{ t(`portal.${product}.points.${point.key}.text`) }}</p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.product { gap: clamp(2.5rem, 6vw, 4rem); }
.product-hero { padding-block-start: clamp(.5rem, 3vw, 2.5rem); }
</style>
