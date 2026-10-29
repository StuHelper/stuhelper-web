<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { segment, type Schema } from './api';
import { useResources } from './useResources';
import StatusBlock from './StatusBlock.vue';
const props = defineProps<{
  resourceId: string;
  owned?: boolean;
  previousTaskId?: string;
}>();
const emit = defineEmits<{ saved: [value: Schema['RequestReceipt']] }>();
const { t } = useI18n();
const kind = ref(props.previousTaskId ? 'appeal' : 'complaint'),
  reason = ref(''),
  contact = ref(''),
  evidence = ref(''),
  done = ref(false);
const state = useResources(() => {
  reason.value = '';
  contact.value = '';
  evidence.value = '';
});
const { busy, error, uncertain } = state;
async function submit() {
  await state.run(async () => {
    const value = await state.mutation.run(
      '/items/' + segment(props.resourceId) + '/requests',
      'RequestReceipt',
      {
        kind: kind.value,
        reason: reason.value,
        contact: contact.value,
        evidence: evidence.value
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean),
        ...(props.previousTaskId
          ? { previous_task_id: props.previousTaskId }
          : {}),
      },
    );
    done.value = true;
    emit('saved', value);
  });
}
</script>
<template>
  <form
    class="resource-form"
    @submit.prevent="submit"
  >
    <h2>{{ t('resources.request') }}</h2>
    <StatusBlock
      :busy="busy"
      :error="error"
      @retry="state.retry"
    />
    <p
      v-if="done"
      role="status"
    >
      {{ t('resources.requestReceived') }}
    </p>
    <fieldset :disabled="busy || uncertain || done">
      <legend>{{ t('resources.requestInformation') }}</legend>
      <label class="resource-field">{{ t('resources.requestKind')
      }}<select v-model="kind">
        <option
          v-if="!previousTaskId"
          value="complaint"
        >
          {{ t('resources.requestKinds.complaint') }}
        </option>
        <option
          v-if="owned && !previousTaskId"
          value="withdrawal"
        >
          {{ t('resources.requestKinds.withdrawal') }}
        </option>
        <option
          v-if="previousTaskId"
          value="appeal"
        >
          {{ t('resources.requestKinds.appeal') }}
        </option>
      </select></label><label class="resource-field">{{ t('resources.reason')
      }}<textarea
        v-model="reason"
        required
        maxlength="2000"
      /></label><label class="resource-field">{{ t('resources.contact')
      }}<input
        v-model="contact"
        :required="kind === 'complaint'"
        maxlength="500"
      ></label><label class="resource-field">{{ t('resources.evidence')
      }}<textarea
        v-model="evidence"
        :required="kind === 'complaint'"
        maxlength="8003"
      />
      </label>
      <p>{{ t('resources.evidenceHint') }}</p>
    </fieldset>
    <button
      v-if="!done"
      type="submit"
      :disabled="busy"
    >
      {{ t(uncertain ? 'resources.retry' : 'resources.sendRequest') }}
    </button>
  </form>
</template>
