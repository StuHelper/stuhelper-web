<script setup lang="ts">
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-vue-next'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, nextTick, ref, useAttrs, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSelect from './AppSelect.vue'

/** 替代 datetime-local。值的格式和原生一致：YYYY-MM-DDTHH:mm，本地时间。 */
defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ required: true })
defineProps<{ required?: boolean; disabled?: boolean }>()
const attrs = useAttrs()
const ariaLabel = computed(() => (typeof attrs['aria-label'] === 'string' ? attrs['aria-label'] : undefined))
const { t, locale } = useI18n()
const open = ref(false)
const pad = (n: number) => String(n).padStart(2, '0')
const parts = computed(() => {
  const found = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(model.value)
  return found ? { year: +found[1]!, month: +found[2]! - 1, day: +found[3]!, hour: +found[4]!, minute: +found[5]! } : undefined
})
const today = new Date()
const year = ref(parts.value?.year ?? today.getFullYear())
const month = ref(parts.value?.month ?? today.getMonth())
watch(open, (value) => { if (value && parts.value) { year.value = parts.value.year; month.value = parts.value.month } })

const dateOf = (y: number, m: number, d: number) => new Date(y, m, d)
const title = computed(() => new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'long' }).format(dateOf(year.value, month.value, 1)))
// 2024-01-01 是星期一。每周从星期一开始。
const weekdays = computed(() => [1, 2, 3, 4, 5, 6, 7].map((d) => new Intl.DateTimeFormat(locale.value, { weekday: 'narrow' }).format(dateOf(2024, 0, d))))
const blanks = computed(() => (dateOf(year.value, month.value, 1).getDay() + 6) % 7)
const days = computed(() => dateOf(year.value, month.value + 1, 0).getDate())
const shown = computed(() => (parts.value ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(dateOf(parts.value.year, parts.value.month, parts.value.day).setHours(parts.value.hour, parts.value.minute)) : t('common.choose')))
const dayLabel = (d: number) => new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(dateOf(year.value, month.value, d))
const isChosen = (d: number) => parts.value?.year === year.value && parts.value.month === month.value && parts.value.day === d

function shift(by: number) {
  const next = dateOf(year.value, month.value + by, 1)
  year.value = next.getFullYear()
  month.value = next.getMonth()
}
function write(y: number, m: number, d: number, hour: number, minute: number) { model.value = `${y}-${pad(m + 1)}-${pad(d)}T${pad(hour)}:${pad(minute)}` }
const pick = (d: number) => write(year.value, month.value, d, parts.value?.hour ?? 0, parts.value?.minute ?? 0)
function setTime(hour: number, minute: number) {
  const now = parts.value ?? { year: year.value, month: month.value, day: 1 }
  write(now.year, now.month, now.day, hour, minute)
}
// 方向键在日期之间移动，跨过月份边界时自动翻月。
const grid = ref<HTMLElement>()
async function arrowKey(event: KeyboardEvent) {
  if (!(event.target instanceof HTMLElement) || !event.target.classList.contains('app-calendar-day')) return
  const rtl = document.documentElement.dir === 'rtl'
  const steps: Record<string, number> = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowUp: -7, ArrowDown: 7 }
  const step = steps[event.key]
  if (!step) return
  event.preventDefault()
  const days = grid.value ? [...grid.value.querySelectorAll<HTMLElement>('.app-calendar-day')] : []
  const next = dateOf(year.value, month.value, days.indexOf(event.target) + 1 + step)
  year.value = next.getFullYear()
  month.value = next.getMonth()
  await nextTick()
  grid.value?.querySelectorAll<HTMLElement>('.app-calendar-day')[next.getDate() - 1]?.focus()
}
const hours = Array.from({ length: 24 }, (_, i) => i)
// 每 5 分钟一档。已有的值不在档位上时也要能显示。
const minutes = computed(() => [...new Set([...Array.from({ length: 12 }, (_, i) => i * 5), parts.value?.minute ?? 0])].sort((a, b) => a - b))
</script>

<template>
  <span class="app-control app-datetime">
    <PopoverRoot v-model:open="open">
      <PopoverTrigger
        class="input app-datetime-trigger"
        :class="[attrs.class, { empty: !parts }]"
        :disabled="disabled"
        :aria-label="ariaLabel"
      >
        <span class="truncate">{{ shown }}</span>
        <Calendar aria-hidden="true" />
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          class="app-popup app-calendar"
          :side-offset="6"
          :collision-padding="8"
          align="start"
        >
          <div
            class="app-calendar-head"
            :data-month="`${year}-${pad(month + 1)}`"
          >
            <button
              class="btn btn-sm btn-icon plain"
              type="button"
              :aria-label="t('common.prevYear')"
              @click="shift(-12)"
            ><ChevronsLeft
              class="flip-rtl"
              aria-hidden="true"
            /></button>
            <button
              class="btn btn-sm btn-icon plain"
              type="button"
              :aria-label="t('common.prevMonth')"
              @click="shift(-1)"
            ><ChevronLeft
              class="flip-rtl"
              aria-hidden="true"
            /></button>
            <strong aria-live="polite">{{ title }}</strong>
            <button
              class="btn btn-sm btn-icon plain"
              type="button"
              :aria-label="t('common.nextMonth')"
              @click="shift(1)"
            ><ChevronRight
              class="flip-rtl"
              aria-hidden="true"
            /></button>
            <button
              class="btn btn-sm btn-icon plain"
              type="button"
              :aria-label="t('common.nextYear')"
              @click="shift(12)"
            ><ChevronsRight
              class="flip-rtl"
              aria-hidden="true"
            /></button>
          </div>
          <div
            ref="grid"
            class="app-calendar-grid"
            @keydown="arrowKey"
          >
            <span
              v-for="(name, i) in weekdays"
              :key="i"
              class="app-calendar-week"
              aria-hidden="true"
            >{{ name }}</span>
            <span
              v-for="i in blanks"
              :key="`blank-${i}`"
            />
            <button
              v-for="d in days"
              :key="d"
              class="app-calendar-day"
              type="button"
              :aria-label="dayLabel(d)"
              :aria-pressed="isChosen(d)"
              @click="pick(d)"
            >
              {{ new Intl.NumberFormat(locale).format(d) }}
            </button>
          </div>
          <div class="app-calendar-time">
            <AppSelect
              class="select"
              :aria-label="t('common.hour')"
              :model-value="String(parts?.hour ?? 0)"
              @update:model-value="setTime(+$event, parts?.minute ?? 0)"
            >
              <option
                v-for="h in hours"
                :key="h"
                :value="String(h)"
              >{{ pad(h) }}</option>
            </AppSelect>
            <AppSelect
              class="select"
              :aria-label="t('common.minute')"
              :model-value="String(parts?.minute ?? 0)"
              @update:model-value="setTime(parts?.hour ?? 0, +$event)"
            >
              <option
                v-for="m in minutes"
                :key="m"
                :value="String(m)"
              >{{ pad(m) }}</option>
            </AppSelect>
            <button
              class="btn btn-sm btn-primary"
              type="button"
              @click="open = false"
            >{{ t('common.confirm') }}</button>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
    <input
      class="app-proxy"
      :value="model"
      :required="required"
      tabindex="-1"
      aria-hidden="true"
    >
  </span>
</template>
