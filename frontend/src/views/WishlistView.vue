<script setup>
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { getWishlist, removeFromWishlist, followSeries } from '../services/api.js';
import { useConfirm } from '../composables/useConfirm.js';
import SeriesCard from '../components/SeriesCard.vue';
import EmptyState from '../components/EmptyState.vue';

const { confirm } = useConfirm();

const wishlist = ref([]);
const loading = ref(true);
const error = ref(null);

async function load() {
  loading.value = true;
  try {
    wishlist.value = await getWishlist();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function handleRemove(series) {
  const ok = await confirm({
    title: 'Quitar de la wishlist',
    message: `¿Quitar «${series.name}» de tu wishlist?`,
    confirmText: 'Quitar',
    danger: true
  });
  if (!ok) return;
  try {
    await removeFromWishlist(series.id);
    wishlist.value = wishlist.value.filter((s) => s.id !== series.id);
  } catch (e) {
    error.value = e.message;
  }
}

async function handleStartCollecting(series) {
  const ok = await confirm({
    title: 'Empezar colección',
    message: `¿Empezar a coleccionar «${series.name}»? Se moverá de la wishlist a tu colección.`,
    confirmText: 'Empezar colección'
  });
  if (!ok) return;
  try {
    await followSeries(series.id);
    await removeFromWishlist(series.id);
    wishlist.value = wishlist.value.filter((s) => s.id !== series.id);
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<template>
  <div>
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

    <EmptyState
      v-else-if="wishlist.length === 0"
      icon="heart"
      title="Tu wishlist está vacía"
      description="Busca series y añádelas para recordar lo que quieres comprar"
    >
      <RouterLink :to="{ name: 'search' }" class="btn-primary">Buscar series</RouterLink>
    </EmptyState>

    <div v-else class="grid-covers">
      <SeriesCard v-for="s in wishlist" :key="s.id" :series="s">
        <template #actions>
          <button class="btn-success btn-sm flex-1" @click="handleStartCollecting(s)">
            Empezar
          </button>
          <button class="btn-danger btn-sm flex-1" @click="handleRemove(s)">
            Eliminar
          </button>
        </template>
      </SeriesCard>
    </div>
  </div>
</template>
