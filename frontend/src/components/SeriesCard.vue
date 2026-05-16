<script setup>
import { RouterLink } from 'vue-router';
import CoverImage from './CoverImage.vue';
import ProgressBar from './ProgressBar.vue';

defineProps({
  series: { type: Object, required: true },
  showProgress: { type: Boolean, default: false }
});
</script>

<template>
  <div class="card flex flex-col">
    <RouterLink
      :to="{ name: 'series-detail', params: { id: series.id } }"
      class="group block"
    >
      <CoverImage :src="series.cover_url" :alt="series.name" />
      <div class="p-3">
        <span :class="series.is_complete ? 'chip chip-success' : 'chip chip-warning'">
          {{ series.is_complete ? 'Completa' : 'En publicación' }}
        </span>
        <h3 class="mt-2 text-sm font-medium line-clamp-2 min-h-[2.5rem]">
          {{ series.name }}
        </h3>
        <div v-if="showProgress" class="mt-2">
          <ProgressBar
            :owned="series.owned_volumes || 0"
            :total="series.total_volumes || 0"
          />
        </div>
      </div>
    </RouterLink>
    <div v-if="$slots.actions" class="px-3 pb-3 mt-auto flex flex-wrap gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
