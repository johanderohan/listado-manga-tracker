<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import CoverImage from './CoverImage.vue';

const props = defineProps({
  vol: { type: Object, required: true }
});

const cover = computed(() => props.vol.cover_url || props.vol.series_cover || '');

// purchased_at viene de SQLite en UTC sin zona; añadir 'Z' para que el
// navegador lo interprete como UTC y muestre la hora local correcta.
const purchasedLabel = computed(() => {
  if (!props.vol.purchased_at) return '';
  const d = new Date(props.vol.purchased_at.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
});
</script>

<template>
  <div class="card flex flex-col">
    <!-- Toda la tarjeta lleva a la ficha de la serie. -->
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
        <span class="chip chip-success mt-auto self-start">
          ✓ {{ purchasedLabel }}
        </span>
      </div>
    </RouterLink>
  </div>
</template>
