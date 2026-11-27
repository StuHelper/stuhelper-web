<script setup lang="ts">
import { hue } from '../../shared/hue'
import { Eye, Scale } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import RowMore from '../../shared/ui/RowMore.vue'
import FavoriteButton from '../favorites/FavoriteButton.vue'
import { compareList } from '../search/compare'
import { knownCredits, type DirectoryItem } from './api'
import { recommendationLevel } from './ratings/levels'
import RatingLevel from './ratings/RatingLevel.vue'

// Course rows of the directory. The flat list shows department and category columns; a
// department group (`compact`) leaves them out because the group heading already names them.
// On phones the columns fold into one line under the name: department, category, review count.
defineProps<{ rows: readonly DirectoryItem[]; compact?: boolean }>()
const emit = defineEmits<{ open: [row: DirectoryItem]; compare: [id: string] }>()
const { t } = useI18n()
const format = useFormat()
const level = (row: DirectoryItem) => recommendationLevel[row.recommendation]
const reviewText = (n: number) => (n ? t('browse.reviewCount', { p0: format.value.number(n) }) : t('browse.noReviews'))
const sub = (row: DirectoryItem) => {
  const credits = knownCredits(row.object)
  return [row.object.code, credits === undefined ? '' : t('academic.subject.credits', { credits: format.value.number(credits) })].filter(Boolean).join(' · ')
}
const inCompare = (id: string) => compareList.course.includes(id)
// An em dash marks "no reviews" in the narrow count column; it is a symbol, not text.
const dash = '\u2014'
</script>

<template>
  <div
    v-if="!compact"
    class="line head"
    aria-hidden="true"
  >
    <span>{{ t('nav.courses') }}</span><span class="dept">{{ t('browse.department') }}</span><span>{{ t('browse.category') }}</span><span>{{ t('browse.recommendation') }}</span><span>{{ t('browse.reviews') }}</span><span />
  </div>
  <ul>
    <li
      v-for="r in rows"
      :key="r.object.id"
      class="line"
      :class="{ compact }"
    >
      <span class="main">
        <RouterLink
          class="name truncate"
          :to="`/courses/${encodeURIComponent(r.object.id)}`"
        >{{ r.object.name }}</RouterLink>
        <span class="subtle truncate">{{ sub(r) }}</span>
        <span class="subtle phone"><span class="truncate">{{ [!compact && r.departments[0]?.name, r.categories[0]?.name, reviewText(r.review_count)].filter(Boolean).join(' · ') }}</span><RatingLevel
          v-if="level(r)"
          :level="level(r)"
        /></span>
      </span>
      <template v-if="!compact">
        <span class="cell small truncate dept">{{ r.departments[0]?.name ?? '' }}</span>
        <span class="cell"><RouterLink
          v-if="r.categories[0]"
          :to="`/courses/${encodeURIComponent(r.object.id)}`"
          :tabindex="-1"
          class="tag tag-hue"
          :style="{ '--hue': hue(r.categories[0].id) }"
          :title="r.categories[0].name"
        >{{ r.categories[0].name }}</RouterLink></span>
      </template>
      <span
        class="cell rec"
        :class="{ none: !level(r) }"
      ><RatingLevel
        v-if="level(r)"
        :level="level(r)"
      /><template v-else>{{ dash }}</template></span>
      <span
        v-if="!compact"
        class="cell small"
        :class="{ none: !r.review_count }"
      >{{ r.review_count ? format.number(r.review_count) : dash }}</span>
      <span class="ops">
        <button
          class="btn btn-sm btn-icon btn-quiet desk peek"
          type="button"
          :aria-label="t('browse.quickViewItem', { p0: r.object.name })"
          @click="emit('open', r)"
        ><Eye aria-hidden="true" /></button>
        <button
          class="btn btn-sm btn-icon btn-quiet desk"
          type="button"
          :aria-label="inCompare(r.object.id) ? t('browse.removeItemFromCompare', { p0: r.object.name }) : t('browse.compareItem', { p0: r.object.name })"
          :aria-pressed="inCompare(r.object.id)"
          @click="emit('compare', r.object.id)"
        ><Scale aria-hidden="true" /></button>
        <FavoriteButton
          :id="r.object.id"
          kind="course"
          quiet
        />
        <RowMore
          :label="t('browse.moreActionsFor', { p0: r.object.name })"
          :items="[{ label: t('browse.quickView'), icon: Eye, action: () => emit('open', r) }, { label: inCompare(r.object.id) ? t('browse.removeFromCompare') : t('browse.addToCompare'), icon: Scale, action: () => emit('compare', r.object.id) }]"
        />
      </span>
    </li>
  </ul>
</template>

<style scoped>
.line { position: relative; display: grid; align-items: center; gap: .75rem; min-height: 44px; padding: .25rem 1rem; grid-template-columns: minmax(0, 1fr) 12rem 9rem 7.5rem 3.5rem 7.25rem; }
.line.compact { grid-template-columns: minmax(0, 1fr) auto 7.25rem; }
li.line + li.line { border-block-start: .5px solid var(--separator); }
li.line:hover { background: var(--accent-soft); }
.head { min-height: 34px; padding-block: .25rem; border-block-end: .5px solid var(--separator); color: var(--label-3); font-size: .8125rem; }
.main { display: grid; min-width: 0; line-height: 1.3; }
.name { color: var(--label); font-size: .9375rem; font-weight: 550; }
.name::after { content: ""; position: absolute; inset: 0; }
.name:hover { color: var(--accent); text-decoration: none; }
.main .subtle { font-size: .75rem; }
.phone { display: none; }
@container (min-width: 30rem) {
  li.line.compact { min-height: 40px; padding-block: .125rem; }
  .line.compact .main { display: flex; align-items: baseline; gap: .625rem; }
  .line.compact .main .subtle { flex: none; }
}
@container (min-width: 58rem) {
  li.line:not(.compact) { min-height: 40px; padding-block: .125rem; }
  .line:not(.compact) .main { display: flex; align-items: baseline; gap: .625rem; }
  .line:not(.compact) .main .subtle { flex: none; }
}
.cell { min-width: 0; color: var(--label-2); font-variant-numeric: tabular-nums; }
.cell.none { color: var(--label-3); }
/* A category stays on one line; a name longer than the column is cut with its full text in the tooltip. */
.cell .tag { position: relative; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rec { display: flex; align-items: center; }
/* A narrow card drops the department column first; the name and the rating matter more. Phones have their own layout below. */
@media (min-width: 761px) {
  @container (max-width: 50rem) {
    .line:not(.compact) { grid-template-columns: minmax(0, 1fr) 9rem 7.5rem 3.5rem 7.25rem; }
    .dept { display: none; }
  }
  @container (max-width: 24rem) { .line.compact .rec { display: none; } }
}
.ops { position: relative; z-index: 1; display: flex; justify-content: flex-end; gap: .125rem; }
/* With a mouse the row actions appear on hover or keyboard focus. The quick view stays faintly visible so it can be found. */
@media (hover: hover) {
  .ops .btn { opacity: 0; transition: opacity .15s, background-color .2s, color .2s; }
  .ops .btn.peek { opacity: .7; }
  li.line:hover .ops .btn, li.line:focus-within .ops .btn, .ops .btn[aria-pressed="true"] { opacity: 1; }
}
@media (max-width: 760px) {
  .line, .line.compact { grid-template-columns: minmax(0, 1fr) auto; }
  .head, .cell, .line.compact .rec { display: none; }
  .phone { display: flex; align-items: center; gap: .5rem; min-width: 0; }
  .phone :deep(.d-level) { flex: none; font-size: .75rem; }
  .name { white-space: normal; }
  .line { padding: .5rem .875rem; }
  .ops .btn { opacity: 1; }
  .ops .desk { display: none; }
}
</style>
