<script setup>
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useCollectionStore } from '../stores/collection.js';
import { useConfirm } from '../composables/useConfirm.js';
import Tabs from '../components/Tabs.vue';
import PendingVolumeCard from '../components/PendingVolumeCard.vue';
import RecentVolumeCard from '../components/RecentVolumeCard.vue';
import EmptyState from '../components/EmptyState.vue';

const collection = useCollectionStore();
const { confirm } = useConfirm();

const activeTab = ref('pending');

// Todo sale del snapshot local: la pantalla se pinta sin esperar a la red y se
// actualiza sola cuando la sincronización trae datos nuevos.
const pending = computed(() => collection.pending);
const upcoming = computed(() => collection.upcoming);
const recent = computed(() => collection.recent);

const lastRefreshLabel = computed(() => {
  const lr = collection.stats?.lastRefresh;
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
  { label: 'Series', value: collection.stats?.totalSeries ?? 0 },
  { label: 'Tomos', value: collection.stats?.totalVolumes ?? 0 },
  { label: 'Completas', value: collection.stats?.completedSeries ?? 0 },
  { label: 'En Wishlist', value: collection.stats?.wishlistCount ?? 0 }
]);

async function handleBuy(vol) {
  const ok = await confirm({
    title: 'Marcar como comprado',
    message: `¿Marcar el tomo ${vol.number} de «${vol.series_name}» como comprado?`,
    confirmText: 'Sí, comprado'
  });
  if (!ok) return;

  // Se aplica en local y se encola: funciona igual con y sin conexión.
  collection.marcarComprado(vol.series_id, vol.number);
}
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

    <EmptyState
      v-if="!collection.hasData"
      icon="book"
      title="Sin datos descargados todavía"
      description="Conéctate a la VPN o a la wifi de casa y toca el chip de sincronizar"
    />

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
