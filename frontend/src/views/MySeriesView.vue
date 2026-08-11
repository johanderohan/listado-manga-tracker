<script setup>
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useCollectionStore } from '../stores/collection.js';
import { searchSeries } from '../lib/collection.js';
import { refreshAllSeries, refollowSeries } from '../services/api.js';
import { useConfirm } from '../composables/useConfirm.js';
import SeriesCard from '../components/SeriesCard.vue';
import Tabs from '../components/Tabs.vue';
import EmptyState from '../components/EmptyState.vue';

const collection = useCollectionStore();
const { confirm } = useConfirm();

const filter = ref('in-progress');
const search = ref('');
const refreshing = ref(false);
const info = ref(null);
const error = ref(null);

// Solo las del usuario: las que están únicamente en la wishlist llegan con
// status nulo y no pintan aquí.
const allSeries = computed(() => collection.series.filter((s) => s.status));

const counts = computed(() => ({
  'in-progress': allSeries.value.filter((s) => s.status === 'following' && s.progress < 100).length,
  all: allSeries.value.filter((s) => s.status === 'following').length,
  discarded: allSeries.value.filter((s) => s.status === 'discarded').length
}));

const tabs = computed(() => [
  { key: 'in-progress', label: 'En progreso', count: counts.value['in-progress'] },
  { key: 'all', label: 'Todas', count: counts.value.all },
  { key: 'discarded', label: 'Descartadas', count: counts.value.discarded }
]);

const filteredSeries = computed(() => {
  // Buscar manda sobre la pestaña, igual que antes; ahora además ignora
  // acentos, que es lo práctico escribiendo en el móvil.
  if (search.value.trim()) return searchSeries(allSeries.value, search.value);

  return allSeries.value.filter((s) => {
    if (filter.value === 'in-progress') return s.status === 'following' && s.progress < 100;
    if (filter.value === 'all') return s.status === 'following';
    if (filter.value === 'discarded') return s.status === 'discarded';
    return true;
  });
});

async function handleRefreshAll() {
  if (allSeries.value.length === 0) return;
  refreshing.value = true;
  info.value = null;
  error.value = null;
  try {
    const r = await refreshAllSeries();
    info.value = r.message;
    await collection.sync();
  } catch (e) {
    error.value = e.message;
  } finally {
    refreshing.value = false;
  }
}

async function handleRefollow(series) {
  const ok = await confirm({
    title: 'Volver a seguir',
    message: `¿Volver a seguir «${series.name}»? Reaparecerá en tu lista principal.`,
    confirmText: 'Volver a seguir'
  });
  if (!ok) return;
  try {
    await refollowSeries(series.id);
    await collection.sync();
  } catch (e) {
    error.value = e.message;
  }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
      <Tabs v-model="filter" :tabs="tabs" />
      <div class="flex gap-3">
        <input
          v-model="search"
          type="text"
          class="input sm:w-64"
          placeholder="Buscar serie…"
        />
        <button
          v-if="filteredSeries.length > 0 && collection.online"
          class="btn-secondary whitespace-nowrap"
          :disabled="refreshing"
          @click="handleRefreshAll"
        >
          {{ refreshing ? 'Actualizando…' : '↻ Actualizar todas' }}
        </button>
      </div>
    </div>

    <div v-if="info" class="surface p-4 text-sm text-emerald-400">{{ info }}</div>
    <div v-if="error" class="surface p-4 text-sm text-red-400">Error: {{ error }}</div>

    <EmptyState
      v-if="!collection.hasData"
      icon="book"
      title="Sin datos descargados todavía"
      description="Conéctate a la VPN o a la wifi de casa y toca el chip de sincronizar"
    />

    <EmptyState
      v-else-if="filteredSeries.length === 0"
      icon="book"
      :title="allSeries.length === 0 ? 'No sigues ninguna serie' : 'Sin series con este filtro'"
      description="Busca series para empezar tu colección"
    >
      <RouterLink :to="{ name: 'search' }" class="btn-primary">Buscar series</RouterLink>
    </EmptyState>

    <div v-else class="grid-covers">
      <SeriesCard
        v-for="s in filteredSeries"
        :key="s.id"
        :series="s"
        show-progress
      >
        <template v-if="s.status === 'discarded' && collection.online" #actions>
          <button class="btn-secondary btn-sm flex-1" @click="handleRefollow(s)">
            Volver a seguir
          </button>
        </template>
      </SeriesCard>
    </div>
  </div>
</template>
