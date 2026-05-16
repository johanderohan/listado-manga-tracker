<script setup>
import { RouterLink } from 'vue-router';
import CoverImage from './CoverImage.vue';

const props = defineProps({
  vol: { type: Object, required: true },
  mode: { type: String, default: 'pending' } // 'pending' | 'upcoming'
});
defineEmits(['buy']);

const cover = props.vol.cover_url || props.vol.series_cover || '';
</script>

<template>
  <div class="card flex flex-col">
    <!-- Toda la tarjeta (portada + textos) lleva a la ficha de la serie.
         El botón "Comprado" detiene la navegación con .prevent.stop. -->
    <RouterLink
      :to="{ name: 'series-detail', params: { id: vol.series_id } }"
      class="group flex flex-col flex-1"
    >
      <CoverImage :src="cover" :alt="`${vol.series_name} Tomo ${vol.number}`" />
      <div class="p-3 flex flex-col gap-1 flex-1">
        <span
          class="text-sm font-medium line-clamp-2 min-h-[2.5rem] group-hover:text-manga-accent transition-colors"
        >
          {{ vol.series_name }}
        </span>
        <span class="text-xs text-ink-muted">Tomo {{ vol.number }}</span>
        <span v-if="vol.price > 0" class="text-xs text-ink-dim">
          {{ vol.price.toFixed(2) }}€
        </span>

        <button
          v-if="mode === 'pending'"
          class="btn-success btn-sm mt-auto"
          @click.prevent.stop="$emit('buy', vol)"
        >
          Comprado
        </button>
        <span v-else class="chip chip-accent mt-auto self-start">
          {{ vol.release_date }}
        </span>
      </div>
    </RouterLink>
  </div>
</template>
