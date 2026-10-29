<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { name, segment, shown, type Resource, type Schema } from './api';
import { useResources } from './useResources';
import RequestForm from './RequestForm.vue';
import StatusBlock from './StatusBlock.vue';
import './resources.css';
const { t, locale, n, d } = useI18n(),
  route = useRoute(),
  entry = ref<Resource>(),
  receipt = ref<Schema['RequestReceipt']>();
const showRequest = ref(false);
const state = useResources(() => {
  entry.value = undefined;
  receipt.value = undefined;
});
const { busy, error } = state;
const version = computed(() => entry.value?.current ?? entry.value?.proposal);
function load() {
  void state.run(async () => {
    entry.value = await state.client.json(
      '/items/' + segment(String(route.params.id)),
      'Resource',
      { signal: state.signal },
    );
  });
}
function download() {
  if (!entry.value?.current?.file) return;
  const file = entry.value.current.file;
  void state.run(() =>
    state.client.download(
      '/items/' + segment(entry.value?.id ?? '') + '/download',
      file.filename,
      file.size,
      state.signal,
    ),
  );
}
watch(
  () => route.params.id,
  () => {
    entry.value = undefined;
    showRequest.value = false;
    load();
  },
  { immediate: true },
);
</script>
<template>
  <section class="resources-page">
    <RouterLink to="/resources">
      {{ t('resources.title') }}
    </RouterLink><StatusBlock
      :busy="busy"
      :error="error"
      @retry="state.retry"
    /><template
      v-if="entry && version"
    >
      <article class="resource-card">
        <h1>{{ version.metadata.title }}</h1>
        <div class="resource-meta">
          <span>{{ name(version.category.names, locale) }}</span><span>{{ t(`resources.states.${version.state}`) }}</span><time>{{ d(new Date(version.created_at), 'date') }}</time>
        </div>
        <p class="resource-details">
          {{ version.metadata.description }}
        </p>
        <dl>
          <template
            v-for="field in version.category.fields"
            :key="field.key"
          >
            <dt>{{ name(field.names, locale) }}</dt>
            <dd>
              {{
                shown(field, version.metadata.attributes[field.key], locale) ||
                  t('resources.unknown')
              }}
            </dd>
          </template>
          <dt>{{ t('resources.origin') }}</dt>
          <dd>{{ t(`resources.origins.${version.metadata.origin.kind}`) }}</dd>
          <template v-if="version.metadata.origin.source">
            <dt>{{ t('resources.source') }}</dt>
            <dd>{{ version.metadata.origin.source }}</dd>
          </template><template v-if="version.metadata.origin.author">
            <dt>{{ t('resources.author') }}</dt>
            <dd>{{ version.metadata.origin.author }}</dd>
          </template><template v-if="version.metadata.origin.license">
            <dt>{{ t('resources.license') }}</dt>
            <dd>{{ version.metadata.origin.license }}</dd>
          </template>
        </dl>
        <p v-if="version.file">
          {{ version.file.filename }} {{ n(version.file.size) }}
          {{ t('resources.bytes') }}
        </p>
        <p
          v-if="entry.proposal && entry.current"
          role="status"
        >
          {{ t('resources.oldVersionContinues') }}
        </p>
        <p v-if="!entry.download_allowed">
          {{ t('resources.accessRequired') }}
        </p>
        <div class="resource-actions">
          <button
            v-if="entry.download_allowed"
            :disabled="busy"
            @click="download"
          >
            {{ t('resources.download') }}
          </button><RouterLink
            v-if="entry.owned"
            :to="'/resources/items/' + entry.id + '/edit'"
          >
            {{ t('resources.edit') }}
          </RouterLink><RouterLink
            v-if="version.metadata.associations.course_id"
            :to="'/courses/' + version.metadata.associations.course_id"
          >
            {{ t('resources.catalog.course') }}
          </RouterLink><button @click="showRequest = !showRequest">
            {{ t('resources.request') }}
          </button>
        </div>
      </article>
      <section
        v-if="showRequest"
        class="resource-card"
      >
        <RequestForm
          :resource-id="entry.id"
          :owned="entry.owned"
          @saved="receipt = $event"
        /><RouterLink
          v-if="receipt"
          to="/resources/requests"
        >
          {{ t('resources.myRequests') }}
        </RouterLink>
      </section>
    </template>
  </section>
</template>
