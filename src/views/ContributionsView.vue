<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Command, Contribution } from '../api/contribution';
import { useContributions } from '../composables/useContributions';
import { conditions, gbInput, localDateInput } from '../contributionForm';
import { createFormatters } from '../formatting';

const { t, te, locale } = useI18n();
const { data, options, policy, statistics, loading, sending, error, publicError, pending, uncertain, completed, reload, prepare, cancel, submit, next, nextOptions, first } = useContributions();
const format = computed(() => createFormatters(locale.value));
const bytes = (value: number) => t('contribution.bytes', { value: format.value.number(value) });
const state = (value: string) => te(`contribution.states.${value}`) ? t(`contribution.states.${value}`) : t('contribution.unknown');
const target = (value: Contribution['desired_state']) => t(`contribution.actions.${({ active: 'resume', paused: 'pause', exiting: 'exit', revoked: 'revoke' })[value]}`);
const reason = (value: string) => te(`contribution.reasons.${value}`) ? t(`contribution.reasons.${value}`) : t('contribution.unknown');
const locked = computed(() => loading.value || sending.value || !!pending.value);
const instance = ref(''), limit = ref(''), reserve = ref('0'), until = ref(''), accepted = ref(false);
const editing = ref<{ item: Contribution; mode: 'configure' | 'renew' } | null>(null);
const invalid = ref(false);
const formTitle = ref<HTMLElement>();
const dialog = ref<HTMLDialogElement>();
let returnFocus: HTMLElement | null = null;
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const action = computed(() => pending.value ? pending.value.kind === 'command' ? pending.value.body.action : 'create' : 'create');
const consent = () => ({ accepted: accepted.value, version: policy.value?.terms.version ?? '', digest: policy.value?.terms.digest ?? '' });
function reset() { editing.value = null; instance.value = ''; limit.value = ''; reserve.value = '0'; until.value = ''; accepted.value = false; invalid.value = false; }
function edit(item: Contribution, mode: 'configure' | 'renew') {
  editing.value = { item, mode }; limit.value = gbInput(item.conditions.limit_bytes); reserve.value = gbInput(item.conditions.personal_reserve);
  until.value = localDateInput(Date.parse(item.conditions.until)); accepted.value = false; invalid.value = false;
  nextTick(() => formTitle.value?.focus());
}
function prepareForm() {
  const p = policy.value; if (!p) return;
  const edit = editing.value;
  const c = conditions(limit.value, reserve.value, until.value, p, Date.now(), edit?.mode === 'configure' ? edit.item.conditions.until : undefined);
  if (!c || (edit?.mode !== 'configure' && !accepted.value) || (!edit && !options.value?.items.some(i => i.id === instance.value)) || (edit?.mode === 'renew' && Date.parse(c.until) <= Date.parse(edit.item.conditions.until))) { invalid.value = true; return; }
  invalid.value = false;
  if (edit) prepare({ kind: 'command', id: edit.item.id, key: crypto.randomUUID(), body: { revision: edit.item.revision, action: edit.mode, conditions: c, ...(edit.mode === 'renew' ? { consent: consent() } : {}) } });
  else prepare({ kind: 'create', key: crypto.randomUUID(), body: { instance_id: instance.value, conditions: c, consent: consent() } });
}
function command(item: Contribution, action: Command['action']) { prepare({ kind: 'command', id: item.id, key: crypto.randomUUID(), body: { revision: item.revision, action } }); }
function mutable(item: Contribution) { return item.desired_state === 'active' || item.desired_state === 'paused'; }
watch(error, value => { if (value === 'unauthenticated' || value === 'forbidden') reset(); });
watch(completed, value => { if (value) reset(); });
watch(pending, async value => {
  await nextTick();
  if (value && !dialog.value?.open) { returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.value?.showModal(); }
  if (!value && dialog.value?.open) { dialog.value.close(); if (returnFocus?.isConnected) returnFocus.focus(); }
});
</script>

<template>
  <section class="contributions">
    <header class="intro">
      <p class="eyebrow">
        {{ t('contribution.eyebrow') }}
      </p><h1>{{ t('contribution.title') }}</h1><p>{{ t('contribution.description') }}</p>
    </header>
    <div class="controls">
      <button
        :disabled="locked"
        @click="reload()"
      >
        {{ t('contribution.refresh') }}
      </button><button
        :disabled="locked"
        @click="first"
      >
        {{ t('contribution.first') }}
      </button>
    </div>
    <div
      role="status"
      aria-live="polite"
      class="status"
    >
      <p v-if="loading">
        {{ t('contribution.loading') }}
      </p>
      <p v-if="error">
        {{ t(`contribution.errors.${error}`) }}
      </p>
      <p v-if="publicError">
        {{ t(`contribution.errors.${publicError}`) }}
      </p>
      <p v-if="completed && !error">
        {{ t('contribution.accepted') }}
      </p>
    </div>
    <section
      v-if="statistics"
      class="panel"
      :aria-label="t('contribution.summary')"
    >
      <h2>{{ t('contribution.summary') }}</h2>
      <dl class="metrics">
        <div><dt>{{ t('contribution.declared') }}</dt><dd>{{ bytes(statistics.declared_bytes) }}</dd></div><div><dt>{{ t('contribution.available') }}</dt><dd>{{ bytes(statistics.available_bytes) }}</dd></div><div><dt>{{ t('contribution.used') }}</dt><dd>{{ bytes(statistics.used_bytes) }}</dd></div>
      </dl>
      <p>{{ t(statistics.status === 'current' ? 'contribution.current' : 'contribution.partial') }}</p><p class="muted">
        {{ t('contribution.observed', { time: format.dateTime(statistics.generated_at) }) }}
      </p>
    </section>
    <template v-if="data">
      <section
        v-if="policy && options"
        class="panel"
      >
        <h2
          ref="formTitle"
          tabindex="-1"
        >
          {{ t(editing ? `contribution.actions.${editing.mode}` : 'contribution.create') }}
        </h2>
        <p v-if="!editing && options.items.length === 0">
          {{ t('contribution.noOptions') }}
        </p>
        <form
          v-if="editing || options.items.length"
          @submit.prevent="prepareForm"
        >
          <fieldset :disabled="locked">
            <label v-if="!editing">{{ t('contribution.storage') }}<select
              v-model="instance"
              :aria-label="t('contribution.storage')"
              required
            ><option
              disabled
              value=""
            >{{ t('contribution.select') }}</option><option
              v-for="option in options.items"
              :key="option.id"
              :value="option.id"
            >{{ t('contribution.option', { adapter: option.adapter, id: option.id.slice(-8), capacity: bytes(option.available_bytes) }) }}</option></select></label>
            <p v-else>
              <bdi>{{ editing.item.id }}</bdi>
            </p>
            <div class="fields">
              <label>{{ t('contribution.limit') }}<input
                v-model="limit"
                inputmode="decimal"
                required
                pattern="[0-9]+([.][0-9]{1,9})?"
              ></label><label>{{ t('contribution.reserve') }}<input
                v-model="reserve"
                inputmode="decimal"
                required
                pattern="[0-9]+([.][0-9]{1,9})?"
              ></label>
            </div>
            <p class="muted">
              {{ t('contribution.range', { min: bytes(policy.min_bytes), max: bytes(policy.max_bytes) }) }}
            </p>
            <label v-if="editing?.mode !== 'configure'">{{ t('contribution.untilInput', { zone }) }}<input
              v-model="until"
              type="datetime-local"
              required
            ></label>
            <p
              v-if="editing?.mode !== 'configure'"
              class="muted"
            >
              {{ t('contribution.termRange', { min: format.number(policy.min_term_seconds / 3600), max: format.number(policy.max_term_seconds / 3600) }) }}
            </p>
            <label
              v-if="editing?.mode !== 'configure'"
              class="agreement"
            ><input
              v-model="accepted"
              type="checkbox"
              required
            ><span>{{ t('contribution.agree') }} <a
              :href="policy.terms.url"
              target="_blank"
              rel="noopener noreferrer"
            >{{ t('contribution.terms', { version: policy.terms.version }) }}</a></span></label>
            <p
              v-if="invalid"
              role="alert"
            >
              {{ t('contribution.invalidForm') }}
            </p>
            <div class="controls">
              <button
                class="primary"
                type="submit"
              >
                {{ t('contribution.review') }}
              </button><button
                v-if="editing"
                type="button"
                @click="reset"
              >
                {{ t('contribution.cancel') }}
              </button>
            </div>
          </fieldset>
        </form>
        <button
          v-if="!editing && options.next_cursor"
          :disabled="locked"
          @click="nextOptions"
        >
          {{ t('contribution.moreOptions') }}
        </button>
      </section>
      <section :aria-label="t('contribution.mine')">
        <h2>{{ t('contribution.mine') }}</h2><p
          v-if="!data.items.length"
          class="panel"
        >
          {{ t('contribution.empty') }}
        </p>
        <div class="inventory">
          <article
            v-for="item in data.items"
            :key="item.id"
            class="panel"
          >
            <h3><bdi>{{ item.adapter }}</bdi></h3><p class="identifier">
              <bdi>{{ item.id }}</bdi>
            </p>
            <dl class="metrics">
              <div><dt>{{ t('contribution.requested') }}</dt><dd>{{ target(item.desired_state) }}</dd></div><div><dt>{{ t('contribution.actual') }}</dt><dd>{{ state(item.state) }}</dd></div><div><dt>{{ t('contribution.quota') }}</dt><dd>{{ bytes(item.conditions.limit_bytes) }}</dd></div><div><dt>{{ t('contribution.personal') }}</dt><dd>{{ bytes(item.conditions.personal_reserve) }}</dd></div>
            </dl>
            <p
              v-if="item.reason"
              class="notice"
            >
              {{ reason(item.reason) }}
            </p>
            <p>{{ t('contribution.until', { time: format.dateTime(item.conditions.until) }) }}</p>
            <template v-if="item.observation">
              <dl class="metrics">
                <div><dt>{{ t('contribution.used') }}</dt><dd>{{ bytes(item.observation.used_bytes) }}</dd></div><div><dt>{{ t('contribution.reserved') }}</dt><dd>{{ bytes(item.observation.reserved_bytes) }}</dd></div><div><dt>{{ t('contribution.available') }}</dt><dd>{{ bytes(item.observation.available_bytes) }}</dd></div>
              </dl><p>{{ t('contribution.remaining', { count: format.number(item.observation.remaining_replicas) }) }}</p><p class="muted">
                {{ t('contribution.observed', { time: format.dateTime(item.observation.observed_at) }) }}
              </p>
            </template>
            <p v-if="item.exit_target_at">
              {{ t('contribution.exitTarget', { time: format.dateTime(item.exit_target_at) }) }}
            </p>
            <div class="controls">
              <button
                v-if="item.desired_state === 'active'"
                :disabled="locked"
                @click="command(item, 'pause')"
              >
                {{ t('contribution.actions.pause') }}
              </button>
              <button
                v-if="item.desired_state === 'paused'"
                :disabled="locked"
                @click="command(item, 'resume')"
              >
                {{ t('contribution.actions.resume') }}
              </button>
              <template v-if="mutable(item)">
                <button
                  :disabled="locked || !policy"
                  @click="edit(item, 'configure')"
                >
                  {{ t('contribution.actions.configure') }}
                </button><button
                  :disabled="locked || !policy"
                  @click="edit(item, 'renew')"
                >
                  {{ t('contribution.actions.renew') }}
                </button><button
                  :disabled="locked"
                  @click="command(item, 'exit')"
                >
                  {{ t('contribution.actions.exit') }}
                </button>
              </template>
              <button
                v-if="item.state !== 'exited' && item.desired_state !== 'revoked'"
                :disabled="locked"
                @click="command(item, 'revoke')"
              >
                {{ t('contribution.actions.revoke') }}
              </button>
              <button
                v-if="item.state === 'blocked'"
                :disabled="locked"
                @click="command(item, 'retry')"
              >
                {{ t('contribution.actions.retry') }}
              </button>
            </div>
          </article>
        </div>
        <button
          :disabled="locked || !data.next_cursor"
          @click="next"
        >
          {{ t('contribution.next') }}
        </button>
      </section>
    </template>
    <dialog
      ref="dialog"
      aria-labelledby="confirmation-title"
      @cancel.prevent="cancel"
    >
      <template v-if="pending">
        <h2 id="confirmation-title">
          {{ t('contribution.confirm', { action: t(`contribution.actions.${action}`) }) }}
        </h2>
        <p
          v-if="pending.kind !== 'create'"
          class="identifier"
        >
          <bdi>{{ pending.id }}</bdi>
        </p>
        <p>{{ t(action === 'exit' ? 'contribution.exitHint' : action === 'revoke' ? 'contribution.revokeHint' : 'contribution.confirmHint') }}</p>
        <p v-if="pending.kind !== 'retry' && pending.body.conditions">
          {{ t('contribution.reviewConditions', { limit: bytes(pending.body.conditions.limit_bytes), reserve: bytes(pending.body.conditions.personal_reserve), until: format.dateTime(pending.body.conditions.until) }) }}
        </p>
        <p
          v-if="error"
          role="alert"
        >
          {{ t(`contribution.errors.${error}`) }}
        </p><p
          v-if="uncertain"
          role="status"
        >
          {{ t('contribution.uncertain') }}
        </p>
        <div class="controls">
          <button
            class="primary"
            :disabled="sending"
            @click="submit"
          >
            {{ t(uncertain ? 'contribution.retryOriginal' : 'contribution.confirmButton') }}
          </button><button
            :disabled="sending || uncertain"
            @click="cancel"
          >
            {{ t('contribution.cancel') }}
          </button>
        </div>
      </template>
    </dialog>
  </section>
</template>

<style scoped>
.contributions { display: grid; gap: 1.5rem; }
.intro { max-width: 46rem; } h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); margin: .4rem 0; } h2 { font-size: 1.25rem; margin-top: 0; } h3 { margin-top: 0; }
.eyebrow { color: var(--accent); font-size: .8rem; letter-spacing: .08em; } .muted, .identifier { color: var(--muted); font-size: .85rem; } .identifier { overflow-wrap: anywhere; }
.panel { padding: 1.5rem; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.inventory { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 25rem), 1fr)); gap: 1rem; margin-bottom: 1rem; }
.controls { display: flex; flex-wrap: wrap; gap: .65rem; } .metrics, .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 1rem; } .metrics dt { color: var(--muted); font-size: .85rem; } .metrics dd { margin: .4rem 0 0; font-weight: 600; overflow-wrap: anywhere; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 1rem; } label { display: grid; gap: .5rem; } input, select, button { min-height: 44px; padding: .65rem .9rem; border: 1px solid var(--border); border-radius: 6px; color: var(--text); background: var(--surface); font: inherit; max-width: 100%; min-width: 0; } button { cursor: pointer; } button:disabled { cursor: default; opacity: .55; } .primary { background: var(--accent); color: white; border-color: var(--accent); } .agreement { display: flex; align-items: center; gap: .7rem; } .agreement input { flex-shrink: 0; } a { color: var(--accent); } .notice { border-inline-start: 3px solid var(--accent); padding-inline-start: .75rem; }
.status:empty { display: none; } dialog { width: min(92vw, 36rem); max-height: 85dvh; overflow-y: auto; border: 1px solid var(--border); border-radius: 12px; padding: 1.75rem; color: var(--text); } dialog::backdrop { background: #15233777; }
</style>
