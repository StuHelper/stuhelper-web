<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  name,
  query,
  shown,
  type Schema,
  type Category,
  type Resource,
  type Value,
} from './api';
import { useResources } from './useResources';
import FieldInput from './FieldInput.vue';
import CatalogSelect from './CatalogSelect.vue';
import StatusBlock from './StatusBlock.vue';
import './resources.css';
const { t, locale, n } = useI18n(),
  route = useRoute();
const categories = ref<Category[]>([]),
  items = ref<Resource[]>([]),
  directories = ref<Schema['Directory'][]>([]),
  capabilities = ref<Schema['Capabilities']>(),
  bundle = ref<Schema['Package']>();
const school = ref(String(route.query.school_id ?? '')),
  course = ref(String(route.query.course_id ?? '')),
  category = ref(''),
  text = ref(''),
  fields = ref<Record<string, Value | undefined>>({}),
  after = ref(''),
  next = ref(''),
  dirAfter = ref(''),
  dirNext = ref(''),
  parents = ref<Schema['Directory'][]>([]),
  selected = ref<string[]>([]);
const state = useResources(() => {
  items.value = [];
  bundle.value = undefined;
  selected.value = [];
});
const { client, mutation, busy, error, uncertain } = state;
const mine = computed(() => route.path === '/resources/me'),
  directory = computed(() => parents.value.at(-1)),
  active = computed(() =>
    categories.value.find((x) => x.id === category.value),
  );
const groups = computed(() => {
  const rows = new Map<string, Resource[]>();
  for (const item of items.value) {
    const version = mine.value ? (item.proposal ?? item.current) : item.current;
    if (!version) continue;
    const group = active.value?.group_by;
    const label = group
      ? shown(
          version.category.fields.find((x) => x.key === group),
          version.metadata.attributes[group],
          locale.value,
        ) || t('resources.unknown')
      : '';
    rows.set(label, [...(rows.get(label) ?? []), item]);
  }
  return [...rows];
});
async function initialize() {
  await state.run(async () => {
    capabilities.value = await client.json('/capabilities', 'Capabilities', {
      signal: state.signal,
    });
    let cursor = '';
    categories.value = [];
    for (let page = 0; page < 10; page++) {
      const result = await client.json(
        '/categories' + query({ limit: '100', after: cursor }),
        'CategoryPage',
        { signal: state.signal },
      );
      categories.value.push(...result.items);
      cursor = result.next_cursor;
      if (!cursor) break;
    }
    categories.value.sort((a, b) => a.order - b.order);
    await read();
  });
}
async function read() {
  const page = await client.json(
    (mine.value ? '/me' : '') +
      query({
        school_id: school.value,
        course_id: course.value,
        category_id: category.value,
        query: text.value,
        attributes: JSON.stringify(fields.value),
        after: after.value,
        directory_id: directory.value?.id,
        limit: '25',
      }),
    'ResourcePage',
    { signal: state.signal },
  );
  items.value = page.items;
  next.value = page.next_cursor;
  selected.value = [];
  if (school.value) {
    const dirs = await client.json(
      '/directories' +
        query({
          school_id: school.value,
          course_id: course.value,
          parent_id: directory.value?.id,
          after: dirAfter.value,
          limit: '25',
        }),
      'DirectoryPage',
      { signal: state.signal },
    );
    directories.value = dirs.items;
    dirNext.value = dirs.next_cursor;
  } else {
    directories.value = [];
    dirNext.value = '';
  }
}
function filter() {
  after.value = '';
  bundle.value = undefined;
  void state.run(read);
}
function changeDirectory(value?: Schema['Directory']) {
  if (value) parents.value.push(value);
  else parents.value.pop();
  after.value = '';
  dirAfter.value = '';
  void state.run(read);
}
function pack(all = false) {
  void state.run(async () => {
    bundle.value = await mutation.run(
      '/packages',
      'Package',
      all
        ? { directory_id: directory.value?.id }
        : { resource_ids: selected.value },
    );
  });
}
function downloadPart(index: number) {
  const b = bundle.value,
    c = capabilities.value;
  if (!b || !c) return;
  void state.run(() =>
    client.download(
      `/packages/${b.id}/parts/${index}`,
      `resources-${index}.zip`,
      c.max_package_bytes,
      state.signal,
    ),
  );
}
watch(category, () => {
  fields.value = {};
});
watch(school, () => {
  course.value = '';
  parents.value = [];
});
watch(course, () => {
  parents.value = [];
});
watch(
  () => route.path,
  () => {
    after.value = '';
    void initialize();
  },
  { immediate: true },
);
</script>
<template>
  <section class="resources-page">
    <header>
      <h1>{{ t(mine ? 'resources.mine' : 'resources.title') }}</h1>
      <nav class="resource-actions">
        <RouterLink to="/resources">
          {{ t('resources.title') }}
        </RouterLink><RouterLink to="/resources/me">
          {{ t('resources.mine') }}
        </RouterLink><RouterLink to="/resources/requests">
          {{ t('resources.myRequests') }}
        </RouterLink><RouterLink to="/resources/new">
          {{ t('resources.upload') }}
        </RouterLink>
      </nav>
    </header>
    <form
      class="resource-card resource-form"
      @submit.prevent="filter"
    >
      <div class="resource-grid">
        <CatalogSelect
          v-model="school"
          kind="school"
          :disabled="busy || uncertain"
        /><CatalogSelect
          v-model="course"
          kind="course"
          :school="school"
          :disabled="busy || uncertain"
        /><label class="resource-field">{{ t('resources.category')
        }}<select
          v-model="category"
          :disabled="busy || uncertain"
        >
          <option value="">{{ t('resources.all') }}</option>
          <option
            v-for="item in categories"
            :key="item.id"
            :value="item.id"
          >
            {{ name(item.names, locale) }}
          </option>
        </select></label><label class="resource-field">{{ t('resources.search')
        }}<input
          v-model="text"
          type="search"
          maxlength="200"
          :disabled="busy || uncertain"
        ></label><FieldInput
          v-for="field in active?.fields.filter((x) => x.filterable)"
          :key="field.key"
          v-model="fields[field.key]"
          :field="field"
          filter
          :disabled="busy || uncertain"
        />
      </div>
      <button
        type="submit"
        :disabled="busy || uncertain"
      >
        {{ t('resources.filter') }}
      </button>
    </form>
    <StatusBlock
      :busy="busy"
      :error="error"
      :empty="!items.length && !directories.length"
      @retry="state.retry"
    />
    <section
      v-if="school"
      class="resource-card"
    >
      <h2>{{ t('resources.directories') }}</h2>
      <div class="resource-actions">
        <button
          v-if="directory"
          :disabled="busy || uncertain"
          @click="changeDirectory()"
        >
          {{ t('resources.parent') }}
        </button><span>{{
          directory ? name(directory.names, locale) : t('resources.root')
        }}</span><button
          v-for="item in directories"
          :key="item.id"
          :disabled="busy || uncertain"
          @click="changeDirectory(item)"
        >
          {{ name(item.names, locale) }}
        </button><button
          v-if="dirNext"
          :disabled="busy || uncertain"
          @click="
            dirAfter = dirNext;
            state.run(read);
          "
        >
          {{ t('resources.more') }}
        </button><button
          v-if="directory"
          :disabled="busy"
          @click="pack(true)"
        >
          {{ t(uncertain ? 'resources.retry' : 'resources.downloadDirectory') }}
        </button>
      </div>
    </section>
    <p
      v-if="active?.group_by"
      class="resource-muted"
    >
      {{ t('resources.pageGroups') }}
    </p>
    <section
      v-for="[label, rows] in groups"
      :key="label"
    >
      <h2 v-if="label">
        {{ label }}
      </h2>
      <ul class="resource-list">
        <li
          v-for="item in rows"
          :key="item.id"
          class="resource-card"
        >
          <div class="resource-actions">
            <input
              v-if="item.download_allowed"
              v-model="selected"
              type="checkbox"
              :value="item.id"
              :aria-label="
                t('resources.select') +
                  ' ' +
                  (item.current?.metadata.title ?? '')
              "
              :disabled="busy || uncertain"
            ><RouterLink :to="'/resources/items/' + item.id">
              {{
                (mine ? (item.proposal ?? item.current) : item.current)
                  ?.metadata.title
              }}
            </RouterLink><span class="resource-state">{{
              t(`resources.states.${(mine ? (item.proposal?.state ?? item.state) : item.state)}`)
            }}</span>
          </div>
          <p>
            {{
              (mine ? (item.proposal ?? item.current) : item.current)?.metadata
                .description
            }}
          </p>
          <div class="resource-meta">
            <span>{{
              name(
                (item.proposal ?? item.current)?.category.names ?? {},
                locale,
              )
            }}</span><span v-if="item.current?.file">{{ n(item.current.file.size) }} {{ t('resources.bytes') }}</span>
          </div>
        </li>
      </ul>
    </section>
    <div class="resource-actions">
      <button
        v-if="selected.length || uncertain"
        :disabled="busy"
        @click="pack()"
      >
        {{
          t(uncertain ? 'resources.retry' : 'resources.downloadSelected')
        }}
      </button><button
        v-if="next"
        :disabled="busy || uncertain"
        @click="
          after = next;
          state.run(read);
        "
      >
        {{ t('resources.more') }}
      </button>
    </div>
    <section
      v-if="bundle"
      class="resource-card"
    >
      <h2>{{ t('resources.packages') }}</h2>
      <p>
        {{ t('resources.packageInstructions', { count: bundle.parts.length }) }}
      </p>
      <ul>
        <li
          v-for="part in bundle.parts"
          :key="part.number"
        >
          <button
            :disabled="busy"
            @click="downloadPart(part.number)"
          >
            {{ t('resources.part', { number: n(part.number) }) }}
          </button><span>{{ n(part.bytes) }} {{ t('resources.bytes') }}</span>
          <ul>
            <li
              v-for="entry in part.files"
              :key="entry.version_id"
            >
              {{ entry.filename }}
            </li>
          </ul>
        </li>
      </ul>
    </section>
  </section>
</template>
