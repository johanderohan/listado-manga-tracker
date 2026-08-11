<script setup>
import { ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { searchSeries, syncSeries } from '../services/api.js';
import EmptyState from '../components/EmptyState.vue';
import NeedsConnection from '../components/NeedsConnection.vue';
import { useCollectionStore } from '../stores/collection.js';

const router = useRouter();
const collection = useCollectionStore();

const query = ref('');
const results = ref([]);
const loading = ref(false);
const syncing = ref(false);
const error = ref(null);
const info = ref(null);
const searched = ref(false);

async function handleSearch() {
  const q = query.value.trim();
  if (!q) return;

  // Atajo: "lm:123" navega directamente a la ficha de la serie 123.
  const m = q.match(/^lm:(\d+)$/);
  if (m) {
    router.push({ name: 'series-detail', params: { id: m[1] } });
    return;
  }

  loading.value = true;
  error.value = null;
  info.value = null;
  try {
    results.value = await searchSeries(q);
    searched.value = true;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function handleSync() {
  syncing.value = true;
  error.value = null;
  info.value = null;
  try {
    const r = await syncSeries();
    info.value = r.message;
  } catch (e) {
    error.value = e.message;
  } finally {
    syncing.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Buscar series nuevas consulta listadomanga a través del NAS. -->
    <NeedsConnection v-if="!collection.online" accion="buscar series nuevas" />
    <template v-else>
    <form class="flex flex-col sm:flex-row gap-3" @submit.prevent="handleSearch">
      <input
        v-model="query"
        type="text"
        class="input flex-1"
        placeholder="Nombre de la serie o lm:id"
      />
      <button type="submit" class="btn-primary" :disabled="loading">
        {{ loading ? 'Buscando…' : 'Buscar' }}
      </button>
    </form>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-ink-muted">Busca en tiempo real en ListadoManga.es</p>
      <button class="btn-secondary" :disabled="syncing" @click="handleSync">
        {{ syncing ? 'Sincronizando…' : 'Sincronizar catálogo' }}
      </button>
    </div>

    <div v-if="info" class="surface p-4 text-sm text-emerald-400">{{ info }}</div>
    <div v-if="error" class="surface p-4 text-sm text-red-400">Error: {{ error }}</div>

    <EmptyState
      v-if="searched && results.length === 0 && !loading"
      title="Sin resultados"
      :description="`No se encontraron series para «${query}»`"
    />

    <div v-if="results.length > 0" class="space-y-3">
      <p class="text-sm text-ink-muted">{{ results.length }} resultados</p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink
          v-for="s in results"
          :key="s.id"
          :to="{ name: 'series-detail', params: { id: s.id } }"
          class="card p-4 flex items-center justify-between gap-3"
        >
          <h3 class="text-sm font-medium">{{ s.name }}</h3>
          <span class="text-xs text-manga-accent shrink-0">Ver →</span>
        </RouterLink>
      </div>
    </div>
    </template>
  </div>
</template>
