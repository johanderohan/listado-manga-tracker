<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import {
  getPendingVolumes,
  getUpcomingVolumes,
  getRecentVolumes,
  markVolumePurchased
} from '../services/api.js';
import { useStatsStore } from '../stores/stats.js';
import { useConfirm } from '../composables/useConfirm.js';
import Tabs from '../components/Tabs.vue';
import PendingVolumeCard from '../components/PendingVolumeCard.vue';
import RecentVolumeCard from '../components/RecentVolumeCard.vue';
import EmptyState from '../components/EmptyState.vue';

const stats = useStatsStore();
const { confirm } = useConfirm();

const pending = ref([]);
const upcoming = ref([]);
const recent = ref([]);
const loading = ref(true);
const error = ref(null);
const activeTab = ref('pending');

const lastRefreshLabel = computed(() => {
  const lr = stats.data?.lastRefresh;
  if (!lr) return null;
  // SQLite guarda en UTC sin zona: añadir 'Z' para hora local correcta.
  return new Date(lr.replace(' ', 'T') + 'Z').toLocaleString('es-ES');
});

const tabs = computed(() => [
  { key: 'pending', label: 'Tomos pendientes', count: pending.value.length },
  { key: 'upcoming', label: 'Próximos lanzamientos', count: upcoming.value.length },
  { key: 'recent', label: 'Últimos añadidos', count: recent.value.length }
]);

const statCards = computed(() => [
  { label: 'Series', value: stats.data?.totalSeries ?? 0 },
  { label: 'Tomos', value: stats.data?.totalVolumes ?? 0 },
  { label: 'Completas', value: stats.data?.completedSeries ?? 0 },
  { label: 'En Wishlist', value: stats.data?.wishlistCount ?? 0 }
]);

async function load() {
  loading.value = true;
  try {
    const [p, u, r] = await Promise.all([
      getPendingVolumes(),
      getUpcomingVolumes(),
      getRecentVolumes(50)
    ]);
    pending.value = p;
    upcoming.value = u;
    recent.value = r;
    await stats.load();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function handleBuy(vol) {
  const ok = await confirm({
    title: 'Marcar como comprado',
    message: `¿Marcar el tomo ${vol.number} de «${vol.series_name}» como comprado?`,
    confirmText: 'Sí, comprado'
  });
  if (!ok) return;
  try {
    await markVolumePurchased(vol.series_id, vol.number);
    pending.value = pending.value.filter(
      (v) => !(v.series_id === vol.series_id && v.number === vol.number)
    );
    stats.bumpVolumes(1);
    // Refrescar "Últimos añadidos" para que aparezca el recién comprado.
    recent.value = await getRecentVolumes(50);
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <!-- Bloque de cifras: oculto en móvil, visible desde md -->
    <div class="hidden md:grid md:grid-cols-4 gap-3">
      <div v-for="c in statCards" :key="c.label" class="surface p-4 text-center">
        <div class="display text-3xl text-manga-accent">{{ c.value }}</div>
        <div class="text-xs text-ink-muted mt-1">{{ c.label }}</div>
      </div>
    </div>
    <p v-if="lastRefreshLabel" class="hidden md:block text-xs text-ink-dim">
      Última actualización: {{ lastRefreshLabel }}
    </p>

    <Tabs v-model="activeTab" :tabs="tabs" />

    <div v-if="loading" class="grid-covers">
      <div v-for="i in 6" :key="i" class="card">
        <div class="aspect-[2/3] skeleton"></div>
        <div class="p-3 space-y-2">
          <div class="h-3 skeleton rounded"></div>
          <div class="h-3 w-2/3 skeleton rounded"></div>
        </div>
      </div>
    </div>

    <div v-else-if="error" class="surface p-4 text-sm text-red-400">Error: {{ error }}</div>

    <template v-else>
      <!-- Tomos pendientes -->
      <section v-if="activeTab === 'pending'">
        <EmptyState
          v-if="pending.length === 0"
          icon="book"
          title="No hay tomos pendientes"
          description="Sigue series para ver aquí los tomos publicados que te faltan"
        >
          <RouterLink :to="{ name: 'search' }" class="btn-primary">Buscar series</RouterLink>
        </EmptyState>
        <div v-else class="grid-covers">
          <PendingVolumeCard
            v-for="vol in pending"
            :key="`${vol.series_id}-${vol.number}`"
            :vol="vol"
            mode="pending"
            @buy="handleBuy"
          />
        </div>
      </section>

      <!-- Próximos lanzamientos -->
      <section v-else-if="activeTab === 'upcoming'">
        <EmptyState
          v-if="upcoming.length === 0"
          icon="book"
          title="Sin próximos lanzamientos"
          description="No hay tomos anunciados pendientes de publicación"
        />
        <div v-else class="grid-covers">
          <PendingVolumeCard
            v-for="vol in upcoming"
            :key="`${vol.series_id}-${vol.number}`"
            :vol="vol"
            mode="upcoming"
          />
        </div>
      </section>

      <!-- Últimos añadidos -->
      <section v-else>
        <EmptyState
          v-if="recent.length === 0"
          icon="book"
          title="Aún no has añadido tomos"
          description="Marca tomos como comprados y aparecerán aquí, el último primero"
        />
        <div v-else class="grid-covers">
          <RecentVolumeCard
            v-for="vol in recent"
            :key="`${vol.series_id}-${vol.number}`"
            :vol="vol"
          />
        </div>
      </section>
    </template>
  </div>
</template>
