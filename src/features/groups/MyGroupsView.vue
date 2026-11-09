<script setup lang="ts">
import { RefreshCw, UsersRound } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { usePaged } from '../../shared/composables/async'
import PagedState from '../../shared/ui/PagedState.vue'
import MeLayout from '../account/MeLayout.vue'
import { actionRoutes, useGroupsApi, type MyGroup } from './api'

// The caller's QQ groups and pending join applications, with what is still
// missing and where to do it. The server judges eligibility from current facts;
// this page only shows the result and links to the step's own page.
const { t, locale } = useI18n()
const format = useFormat()
const api = useGroupsApi()
const list = usePaged<MyGroup>((cursor, signal) => api.mine(cursor, signal))
void list.reload()

// Unknown facts are joined with the language's own list punctuation.
const facts = (group: MyGroup) => new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(group.unknown_conditions.map((fact) => t(`groups.fact.${fact}`)))
const tone: Record<MyGroup['eligibility'], string> = { eligible: 'tag-success', ineligible: 'tag-warning', unknown: 'tag-info' }
// Steps done in QQ or by the group's administrators have no page here; they are shown as text.
const inQq = (group: MyGroup) => group.next_actions.filter((action) => !actionRoutes[action] && action !== 'refresh')
const links = (group: MyGroup) => group.next_actions.flatMap((action) => {
  const to = actionRoutes[action]
  return to ? [{ action, to }] : []
})
</script>

<template>
  <MeLayout
    :title="t('groups.title')"
    :description="t('groups.description')"
  >
    <template #actions>
      <button
        class="btn btn-sm"
        type="button"
        :disabled="list.status.value === 'loading'"
        @click="list.reload"
      >
        <RefreshCw aria-hidden="true" />{{ t('groups.refresh') }}
      </button>
    </template>
    <PagedState
      :status="list.status.value"
      :error="list.error.value"
      :count="list.items.value.length"
      :next="list.next.value"
      :appending="list.appending.value"
      :empty-text="t('groups.empty')"
      @retry="list.reload"
      @more="list.loadMore"
    >
      <ul class="stack">
        <li
          v-for="group in list.items.value"
          :key="group.id"
          class="card stack"
          :aria-labelledby="`group-${group.id}`"
        >
          <div class="row avatar-row">
            <span
              class="icon-tile"
              style="--tile: var(--c-cyan)"
            ><UsersRound aria-hidden="true" /></span>
            <div class="group-body">
              <b :id="`group-${group.id}`">{{ group.name }}</b>
              <span
                v-if="group.number"
                class="subtle"
              >{{ t('groups.number', { number: group.number }) }}</span>
            </div>
            <span
              class="tag"
              :class="tone[group.eligibility]"
            >{{ t(`groups.eligibility.${group.eligibility}`) }}</span>
          </div>
          <dl class="facts">
            <dt>{{ t('groups.stateLabel') }}</dt>
            <dd>
              {{ t(`groups.state.${group.state}`) }}<template v-if="!group.joined && group.state !== 'requested'">
                · {{ t('groups.notJoined') }}
              </template>
            </dd>
            <template v-if="group.deadline">
              <dt>{{ t('groups.deadline') }}</dt>
              <dd><time :datetime="group.deadline">{{ format.dateTime(group.deadline) }}</time></dd>
            </template>
          </dl>
          <div
            v-if="group.missing_conditions.length"
            class="stack-sm"
          >
            <p class="small">
              {{ t('groups.missing') }}
            </p>
            <ul class="bullets small">
              <li
                v-for="condition in group.missing_conditions"
                :key="condition"
              >
                {{ t(`groups.condition.${condition}`) }}
              </li>
            </ul>
          </div>
          <p
            v-if="group.unknown_conditions.length"
            class="notice notice-info small"
          >
            {{ t('groups.unknown', { facts: facts(group) }) }}
          </p>
          <p
            v-for="action in inQq(group)"
            :key="action"
            class="muted small"
          >
            {{ t(`groups.hint.${action}`) }}
          </p>
          <div
            v-if="links(group).length"
            class="row"
          >
            <RouterLink
              v-for="link in links(group)"
              :key="link.action"
              class="btn btn-sm btn-primary"
              :to="link.to"
            >
              {{ t(`groups.action.${link.action}`) }}
            </RouterLink>
          </div>
        </li>
      </ul>
    </PagedState>
  </MeLayout>
</template>

<style scoped>
.avatar-row { flex-wrap: nowrap; gap: .75rem; }
.group-body { flex: 1; min-width: 0; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: .25rem 1rem; margin: 0; }
.facts dt { color: var(--label-2); }
.facts dd { margin: 0; }
.bullets { margin: 0; padding-inline-start: 1.25rem; list-style: disc; }
</style>
