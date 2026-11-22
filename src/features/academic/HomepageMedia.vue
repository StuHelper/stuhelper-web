<script setup lang="ts">
import { ExternalLink, FileText, Film, Image as ImageIcon } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import HomepageImage from './HomepageImage.vue'
import { isCopied, type HomepageMedium } from './teacherHomepage'

// The media of one part of the homepage. Copied images are shown in place; images that were
// not copied, videos and attachments are links to the school's page, opened only when clicked
// and without sending the StuHelper address along.
defineProps<{ items: HomepageMedium[] }>()
const emit = defineEmits<{ gone: [] }>()
const { t } = useI18n()
const icons = { image: ImageIcon, video: Film, attachment: FileText }
</script>

<template>
  <div
    v-if="items.length"
    class="homepage-media stack-sm"
  >
    <template
      v-for="(item, index) in items"
      :key="`${index}:${item.url}`"
    >
      <HomepageImage
        v-if="isCopied(item)"
        :item="item"
        @gone="emit('gone')"
      />
      <a
        v-else
        class="homepage-link"
        :href="item.url"
        target="_blank"
        rel="noopener noreferrer"
        referrerpolicy="no-referrer"
      >
        <component
          :is="icons[item.kind]"
          aria-hidden="true"
        />
        <span>{{ item.title ?? t(`teacherHomepage.media.${item.kind}Link`) }}</span>
        <ExternalLink
          class="homepage-link-out"
          aria-hidden="true"
        />
        <span class="visually-hidden">{{ t('teacherHomepage.media.external') }}</span>
      </a>
    </template>
  </div>
</template>

<style scoped>
.homepage-link { display: inline-flex; align-items: center; gap: .375rem; max-width: 100%; overflow-wrap: anywhere; }
.homepage-link svg { flex: none; width: 1em; height: 1em; }
.homepage-link-out { opacity: .6; }
</style>
