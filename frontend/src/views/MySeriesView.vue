<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { getUserSeries, refreshAllSeries, refollowSeries } from '../services/api.js';
import { useConfirm } from '../composables/useConfirm.js';
import SeriesCard from '../components/SeriesCard.vue';
import Tabs from '../components/Tabs.vue';
import EmptyState from '../components/EmptyState.vue';

const { confirm } = useConfirm();

const allSeries = ref([]);
const loading = ref(true);
const error = ref(null);
const filter = ref('in-progress');
const search = ref('');
const refreshing = ref(false);
const info = ref(null);

async function load() {
  loading.value = true;
  try {
    const [following, discarded] = await Promise.all([
      getUserSeries('following'),
      getUserSeries('discarded')
    ]);
    allSeries.value = [...following, ...discarded];
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

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

const filteredSeries = computed(() =>
  allSeries.value.filter((s) => {
    if (search.value.trim()) {
      return s.name.toLowerCase().includes(search.value.toLowerCase());
    }
    if (filter.value === 'in-progress') return s.status === 'following' && s.progress < 100;
    if (filter.value === 'all') return s.status === 'following';
    if (filter.value === 'discarded') return s.status === 'discarded';
    return true;
  })
);

async function handleRefreshAll() {
  if (allSeries.value.length === 0) return;
  refreshing.value = true;
  info.value = null;
  try {
    const r = await refreshAllSeries();
    info.value = r.message;
    await load();
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
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
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
          v-if="filteredSeries.length > 0"
          class="btn-secondary whitespace-nowrap"
          :disabled="refreshing"
          @click="handleRefreshAll"
        >
          {{ refreshing ? 'Actualizando…' : '↻ Actualizar todas' }}
        </button>
      </div>
    </div>

    <div v-if="info" class="surface p-4 text-sm text-emerald-400">{{ info }}</div>

    <div v-if="loading" class="grid-covers">
      <div v-for="i in 8" :key="i" class="card">
        <div class="aspect-[2/3] skeleton"></div>
        <div class="p-3 space-y-2">
          <div class="h-3 skeleton rounded"></div>
          <div class="h-3 w-2/3 skeleton rounded"></div>
        </div>
      </div>
    </div>

    <div v-else-if="error" class="surface p-4 text-sm text-red-400">Error: {{ error }}</div>

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
        <template v-if="s.status === 'discarded'" #actions>
          <button class="btn-secondary btn-sm flex-1" @click="handleRefollow(s)">
            Volver a seguir
          </button>
        </template>
      </SeriesCard>
    </div>
  </div>
</template>
