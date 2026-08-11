<script setup>
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { removeFromWishlist, followSeries } from '../services/api.js';
import { useCollectionStore } from '../stores/collection.js';
import { useConfirm } from '../composables/useConfirm.js';
import SeriesCard from '../components/SeriesCard.vue';
import EmptyState from '../components/EmptyState.vue';
import NeedsConnection from '../components/NeedsConnection.vue';

const { confirm } = useConfirm();
const collection = useCollectionStore();

const error = ref(null);
const wishlist = computed(() => collection.wishlist);

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
    await collection.sync();
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
    await collection.sync();
  } catch (e) {
    error.value = e.message;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="error" class="surface p-4 text-sm text-red-400">Error: {{ error }}</div>

    <!-- Sin conexión la wishlist se consulta, pero no se toca. -->
    <NeedsConnection v-if="!collection.online" accion="modificar la wishlist" />

    <EmptyState
      v-if="!collection.hasData"
      icon="heart"
      title="Sin datos descargados todavía"
      description="Conéctate a la VPN o a la wifi de casa y toca el chip de sincronizar"
    />

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
        <template v-if="collection.online" #actions>
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
