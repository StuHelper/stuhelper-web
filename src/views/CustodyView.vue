<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { CustodyBinding } from '../api/custody';
import { useCustody } from '../composables/useCustody';
import { createFormatters } from '../formatting';

const admin = false;
const { t, locale } = useI18n();
const { data, policy, loading, sending, error, recovery, reload, submit, resume, recover } = useCustody(admin);
const format = computed(() => createFormatters(locale.value));
const mode = ref<'local' | 'sso'>('local'), username = ref(''), password = ref(''), until = ref(''), accepted = ref(false);
const editing = ref<CustodyBinding | null>(null), invalid = ref(false), title = ref<HTMLElement>();
const locked = computed(() => loading.value || sending.value || !!recovery.value);
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
function clearSecrets() { password.value = ''; username.value = ''; }
function reset() { clearSecrets(); editing.value = null; accepted.value = false; invalid.value = false; until.value = ''; }
function edit(item: CustodyBinding) { reset(); editing.value = item; nextTick(() => title.value?.focus()); }
async function send() {
  const p = policy.value, expires = new Date(until.value).getTime();
  if (!p || !accepted.value || !username.value || !password.value || !Number.isFinite(expires) || expires <= Date.now() + 60_000 || expires > Date.now() + p.max_term_seconds * 1000) { invalid.value = true; return; }
  invalid.value = false;
  const task = submit({ adapter: 'bhpan', credential: { mode: mode.value, username: username.value, password: password.value }, until: new Date(expires).toISOString(), consent: { accepted: true, version: p.version, digest: p.digest }, ...(editing.value ? { revision: editing.value.revision } : {}) }, editing.value ?? undefined);
  clearSecrets(); accepted.value = false;
  await task;
  if (!error.value) reset();
}
watch(error, e => { if (e === 'forbidden' || e === 'unauthenticated') reset(); });
</script>

<template>
  <section class="custody-page">
    <h1>{{ t(admin ? 'custody.adminTitle' : 'custody.title') }}</h1>
    <p>{{ t(admin ? 'custody.adminDescription' : 'custody.description') }}</p>
    <nav
      class="controls"
      :aria-label="t('custody.navigation')"
    >
      <RouterLink to="/contributions">
        {{ t('contribution.title') }}
      </RouterLink>
      <button
        :disabled="loading || sending"
        @click="reload('')"
      >
        {{ t('custody.refresh') }}
      </button>
    </nav>
    <div
      role="status"
      aria-live="polite"
    >
      <p v-if="loading || sending">
        {{ t(sending ? 'custody.sending' : 'custody.loading') }}
      </p>
      <p v-if="error">
        {{ t(`contribution.errors.${error}`) }}
      </p>
      <template v-if="recovery">
        <p>{{ t('custody.uncertain') }}</p>
        <button
          :disabled="loading || sending"
          @click="recover"
        >
          {{ t('custody.recover') }}
        </button>
      </template>
    </div>
    <form
      v-if="!admin && data && policy"
      class="panel"
      autocomplete="off"
      @submit.prevent="send"
    >
      <h2
        ref="title"
        tabindex="-1"
      >
        {{ t(editing ? 'custody.reauthorize' : 'custody.connect') }}
      </h2>
      <p v-if="editing">
        <bdi>{{ editing.id }}</bdi>
      </p>
      <fieldset :disabled="locked">
        <legend>{{ t('custody.credentials') }}</legend>
        <label>{{ t('custody.mode') }}<select v-model="mode"><option value="local">{{ t('custody.local') }}</option><option value="sso">{{ t('custody.sso') }}</option></select></label>
        <label>{{ t('custody.username') }}<input
          v-model="username"
          required
          maxlength="128"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
        ></label>
        <label>{{ t('custody.password') }}<input
          v-model="password"
          required
          type="password"
          maxlength="1024"
          autocomplete="new-password"
        ></label>
        <label>{{ t('custody.until', { zone }) }}<input
          v-model="until"
          required
          type="datetime-local"
        ></label>
        <p>{{ t('custody.ssoNotice') }}</p>
        <a
          :href="policy.url"
          target="_blank"
          rel="noopener noreferrer"
        >{{ t('custody.terms', { version: policy.version }) }}</a>
        <label class="consent"><input
          v-model="accepted"
          type="checkbox"
          required
        >{{ t('custody.consent') }}</label>
        <p
          v-if="invalid"
          role="alert"
        >
          {{ t('custody.invalid') }}
        </p>
        <div class="controls">
          <button type="submit">
            {{ t('custody.submit') }}
          </button><button
            v-if="editing"
            type="button"
            @click="reset"
          >
            {{ t('custody.cancel') }}
          </button>
        </div>
      </fieldset>
    </form>
    <section
      v-if="data"
      :aria-label="t('custody.accounts')"
    >
      <h2>{{ t('custody.accounts') }}</h2><p v-if="!data.items.length">
        {{ t('custody.empty') }}
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
          <p>{{ t(`custody.states.${item.state}`) }}</p>
          <p>{{ t('custody.requestUntil', { time: format.dateTime(item.authorization_expires_at) }) }}</p>
          <p v-if="item.last_error">
            {{ t(`custody.reasons.${item.last_error}`) }}
          </p>
          <div class="controls">
            <button
              v-if="!admin && (item.state === 'ready' || item.state === 'credentials_required')"
              :disabled="locked"
              @click="edit(item)"
            >
              {{ t('custody.reauthorize') }}
            </button>
            <button
              v-if="item.state === 'pending' || item.state === 'blocked'"
              :disabled="locked"
              @click="resume(item)"
            >
              {{ t('custody.resume') }}
            </button>
          </div>
        </article>
      </div>
      <button
        :disabled="locked || !data.next_cursor"
        @click="reload(data.next_cursor)"
      >
        {{ t('custody.next') }}
      </button>
    </section>
  </section>
</template>

<style scoped>
.custody-page { max-width: 1000px; margin: auto; padding: 1.5rem; overflow-wrap: anywhere; }
h1,h2,h3 { font-weight: 650; margin-block: .75rem; }
h1 { font-size: 1.8rem; } h2 { font-size: 1.3rem; }
p { margin-block: .6rem; }
.panel { border: 1px solid var(--border, #a1a1aa); border-radius: .7rem; padding: 1rem; margin-block: 1rem; }
.controls { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; margin-block: .75rem; }
.inventory { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 1rem; }
fieldset { border: 0; padding: 0; min-width: 0; }
label { display: flex; flex-direction: column; gap: .3rem; margin-block: .75rem; }
input,select,button { font: inherit; color: inherit; background: transparent; border: 1px solid var(--border, #a1a1aa); border-radius: .3rem; min-height: 44px; padding: .5rem; max-width: 100%; }
input,select { width: 100%; } button { cursor: pointer; } button:disabled { opacity: .5; cursor: default; }
.consent { flex-direction: row; align-items: start; } .consent input { width: 24px; min-width: 24px; min-height: 24px; margin-block-start: .2rem; }
a { text-decoration: underline; } .identifier { font-size: .9rem; } :focus-visible { outline: 3px solid #3b82f6; outline-offset: 2px; }
</style>
