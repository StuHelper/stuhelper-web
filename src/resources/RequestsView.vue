<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { query, segment, type Schema } from './api';
import { useResources } from './useResources';
import RequestForm from './RequestForm.vue';
import StatusBlock from './StatusBlock.vue';
import './resources.css';
const { t, d } = useI18n();
const items = ref<Schema['RequestReceipt'][]>([]),
  selected = ref<Schema['RequestReceipt']>(),
  after = ref(''),
  next = ref(''),
  appeal = ref(false);
const state = useResources(() => {
  items.value = [];
  selected.value = undefined;
});
const { busy, error, uncertain } = state;
function load() {
  void state.run(async () => {
    const page = await state.client.json(
      '/requests' + query({ after: after.value, limit: '25' }),
      'RequestPage',
      { signal: state.signal },
    );
    items.value = page.items;
    next.value = page.next_cursor;
  });
}
function open(id: string) {
  appeal.value = false;
  void state.run(async () => {
    selected.value = await state.client.json(
      '/requests/' + segment(id),
      'RequestReceipt',
      { signal: state.signal },
    );
  });
}
function retry() {
  void state.run(async () => {
    if (selected.value)
      selected.value = await state.mutation.run(
        '/requests/' + segment(selected.value.id) + '/retry',
        'RequestReceipt',
        {},
      );
  });
}
load();
</script>
<template>
  <section class="resources-page">
    <h1>{{ t('resources.myRequests') }}</h1>
    <RouterLink to="/resources/me">
      {{ t('resources.mine') }}
    </RouterLink><StatusBlock
      :busy="busy"
      :error="error"
      :empty="!items.length"
      @retry="state.retry"
    />
    <ul class="resource-list">
      <li
        v-for="item in items"
        :key="item.id"
        class="resource-card"
      >
        <h2>{{ t(`resources.requestKinds.${item.kind}`) }}</h2>
        <time>{{ d(new Date(item.created_at), 'date') }}</time><button
          :disabled="busy || uncertain"
          @click="open(item.id)"
        >
          {{ t('resources.checkStatus') }}
        </button>
      </li>
    </ul>
    <button
      v-if="next"
      :disabled="busy || uncertain"
      @click="
        after = next;
        load();
      "
    >
      {{ t('resources.more') }}
    </button>
    <section
      v-if="selected"
      class="resource-card"
    >
      <p role="status">
        {{ t(`resources.states.${selected.state}`) }}
      </p>
      <p>{{ selected.decision_reason }}</p>
      <RouterLink :to="'/resources/items/' + selected.resource_id">
        {{ t('resources.view') }}
      </RouterLink><button
        v-if="selected.state === 'failed'"
        :disabled="busy"
        @click="retry"
      >
        {{ t('resources.retry') }}
      </button><button
        v-if="selected.can_appeal"
        @click="appeal = true"
      >
        {{ t('resources.appeal') }}
      </button><RequestForm
        v-if="appeal && selected.resource_id && selected.task_id"
        :key="selected.id"
        :resource-id="selected.resource_id"
        :previous-task-id="selected.task_id"
        @saved="
          appeal = false;
          load();
        "
      />
    </section>
  </section>
</template>
