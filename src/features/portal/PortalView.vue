<script setup lang="ts">
import {
  Activity, AppWindow, ArrowUpRight, BookOpen, CalendarDays, ChevronRight, Database, FileCheck2, FolderOpen, GraduationCap, KeyRound, MessageSquareText, Network, Scale, ScanSearch,
  ShoppingBag, SlidersHorizontal, UserRound, Waypoints,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { products } from '../../app/products'
import { useLinkAvailable } from '../../shared/capabilities'
import { vSpotlight, vTilt } from '../../shared/ui/pointer'
import { vReveal } from '../../shared/ui/reveal'
import ProductShowcase from './ProductShowcase.vue'
import '../../styles/landing.css'

// The portal of the whole brand. The largest element is the logo and the name;
// each product then gets its name, a short phrase and an explanation.
const { t } = useI18n()
const available = useLinkAvailable()
// Letters enter one by one; the heading keeps its full name for assistive technology.
const letters = [...t('brand.name')]
const tones = { campus: '#2d5bff', api: '#7a4de8', store: '#0d9467', platform: '#e0662b' }
const tiles = [
  { to: '/campus', key: 'campus', name: 'nav.campus', icon: GraduationCap },
  { to: products.api.path, key: 'api', brand: products.api.name, icon: Waypoints },
  { to: '/store', key: 'store', brand: products.store.name, icon: ShoppingBag },
  { to: { path: '/', hash: '#platform' }, key: 'platform', name: 'nav.platform', icon: Network },
] as const
const campus = [
  { key: 'reviews', icon: MessageSquareText },
  { key: 'resources', icon: FolderOpen },
  { key: 'compare', icon: Scale },
  { key: 'schedule', icon: CalendarDays },
] as const
const api = [
  { key: 'protocols', icon: Waypoints },
  { key: 'tokens', icon: KeyRound },
  { key: 'usage', icon: Activity },
] as const
const store = [
  { key: 'check', icon: ScanSearch },
  { key: 'progress', icon: BookOpen },
  { key: 'receipts', icon: FileCheck2 },
] as const
const platform = [
  { key: 'identity', icon: UserRound },
  { key: 'apps', icon: AppWindow },
  { key: 'scopes', icon: Database },
  { key: 'consent', icon: SlidersHorizontal },
] as const
</script>

<template>
  <div class="lp">
    <section class="lp-hero">
      <div class="lp-wordmark">
        <img
          src="/brand.png"
          alt=""
          width="112"
          height="112"
        >
        <h1 :aria-label="t('brand.name')">
          <span
            v-for="(letter, index) in letters"
            :key="index"
            :style="{ '--i': index }"
            aria-hidden="true"
          >{{ letter }}</span>
        </h1>
      </div>
      <nav
        class="lp-tiles"
        :aria-label="t('nav.products')"
      >
        <RouterLink
          v-for="(tile, index) in tiles"
          :key="tile.key"
          v-spotlight
          class="lp-tile"
          :to="tile.to"
          :style="{ '--pc': tones[tile.key], '--i': index }"
        >
          <ArrowUpRight
            class="lp-tile-go"
            aria-hidden="true"
          />
          <span class="lp-tile-icon"><component
            :is="tile.icon"
            aria-hidden="true"
          /></span>
          <b>{{ 'brand' in tile ? tile.brand : t(tile.name) }}</b>
          <p>{{ t(`portal.tiles.${tile.key}`) }}</p>
        </RouterLink>
      </nav>
    </section>

    <section
      v-reveal
      class="lp-split lp-reveal"
      :style="{ '--pc': tones.campus }"
      aria-labelledby="portal-campus"
    >
      <div>
        <h2
          id="portal-campus"
          class="lp-h2"
        >
          {{ t('portal.campus.name') }}
        </h2>
        <p class="lp-tag">
          {{ t('portal.campus.tag') }}
        </p>
        <p class="lp-lead">
          {{ t('portal.campus.lead') }}
        </p>
        <div class="lp-points">
          <div
            v-for="point in campus"
            :key="point.key"
            class="lp-point"
          >
            <component
              :is="point.icon"
              aria-hidden="true"
            />
            <div>
              <b>{{ t(`portal.campus.points.${point.key}.title`) }}</b>
              <p>{{ t(`portal.campus.points.${point.key}.text`) }}</p>
            </div>
          </div>
        </div>
        <div class="lp-cta">
          <RouterLink
            class="lp-link"
            to="/campus"
          >
            {{ t('portal.campus.action') }}<ChevronRight aria-hidden="true" />
          </RouterLink>
        </div>
      </div>
      <div
        v-tilt
        class="lp-art"
      >
        <ProductShowcase kind="campus" />
      </div>
    </section>

    <section
      v-reveal
      class="lp-split flip lp-reveal"
      :style="{ '--pc': tones.api }"
      aria-labelledby="portal-api"
    >
      <div>
        <h2
          id="portal-api"
          class="lp-h2"
        >
          {{ products.api.fullName }}
        </h2>
        <p class="lp-tag">
          {{ t('portal.api.tag') }}
        </p>
        <p class="lp-lead">
          {{ t('portal.api.lead') }}
        </p>
        <div class="lp-points">
          <div
            v-for="point in api"
            :key="point.key"
            class="lp-point"
          >
            <component
              :is="point.icon"
              aria-hidden="true"
            />
            <div>
              <b>{{ t(`portal.api.points.${point.key}.title`) }}</b>
              <p>{{ t(`portal.api.points.${point.key}.text`) }}</p>
            </div>
          </div>
        </div>
        <div class="lp-cta">
          <RouterLink
            class="lp-link"
            :to="products.api.path"
          >
            {{ t('portal.more', { name: products.api.fullName }) }}<ChevronRight aria-hidden="true" />
          </RouterLink>
        </div>
      </div>
      <div
        v-tilt
        class="lp-art"
      >
        <ProductShowcase kind="api" />
      </div>
    </section>

    <section
      v-reveal
      class="lp-split lp-reveal"
      :style="{ '--pc': tones.store }"
      aria-labelledby="portal-store"
    >
      <div>
        <h2
          id="portal-store"
          class="lp-h2"
        >
          {{ products.store.fullName }}
        </h2>
        <p class="lp-tag">
          {{ t('portal.store.tag') }}
        </p>
        <p class="lp-lead">
          {{ t('portal.store.lead') }}
        </p>
        <div class="lp-points">
          <div
            v-for="point in store"
            :key="point.key"
            class="lp-point"
          >
            <component
              :is="point.icon"
              aria-hidden="true"
            />
            <div>
              <b>{{ t(`portal.store.points.${point.key}.title`) }}</b>
              <p>{{ t(`portal.store.points.${point.key}.text`) }}</p>
            </div>
          </div>
        </div>
        <div class="lp-cta">
          <RouterLink
            class="lp-link"
            to="/store"
          >
            {{ t('portal.more', { name: products.store.fullName }) }}<ChevronRight aria-hidden="true" />
          </RouterLink>
        </div>
      </div>
      <div
        v-tilt
        class="lp-art"
      >
        <ProductShowcase kind="store" />
      </div>
    </section>

    <section
      id="platform"
      v-reveal
      class="lp-reveal"
      :style="{ '--pc': tones.platform }"
      aria-labelledby="portal-platform"
    >
      <div class="lp-split flip">
        <div>
          <h2
            id="portal-platform"
            class="lp-h2"
          >
            {{ t('portal.platform.title') }}
          </h2>
          <p class="lp-tag">
            {{ t('portal.platform.tag') }}
          </p>
          <p class="lp-lead">
            {{ t('portal.platform.lead') }}
          </p>
          <div
            v-if="available('/me/developer')"
            class="lp-cta"
          >
            <RouterLink
              class="lp-link"
              to="/me/developer"
            >
              {{ t('portal.platform.action') }}<ChevronRight aria-hidden="true" />
            </RouterLink>
          </div>
        </div>
        <div
          v-tilt
          class="lp-art"
        >
          <ProductShowcase kind="sso" />
        </div>
      </div>
      <div class="lp-cards four">
        <div
          v-for="point in platform"
          :key="point.key"
          class="lp-card"
        >
          <component
            :is="point.icon"
            aria-hidden="true"
          />
          <b>{{ t(`portal.platform.points.${point.key}.title`) }}</b>
          <p>{{ t(`portal.platform.points.${point.key}.text`) }}</p>
        </div>
      </div>
    </section>
  </div>
</template>
