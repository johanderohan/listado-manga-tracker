<script setup>
import { computed } from 'vue';
import { useCollectionStore } from '../stores/collection.js';

const collection = useCollectionStore();

function hace(iso) {
  if (!iso) return 'nunca';
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'ahora mismo';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} días`;
}

const texto = computed(() => {
  if (collection.syncing) return 'Sincronizando…';
  if (collection.outbox.length > 0) {
    return `${collection.outbox.length} cambio${collection.outbox.length > 1 ? 's' : ''} sin enviar`;
  }
  if (!collection.online) return `Sin conexión · ${hace(collection.lastSyncAt)}`;
  return `Sincronizado ${hace(collection.lastSyncAt)}`;
});

const tono = computed(() => {
  if (collection.outbox.length > 0) return 'chip chip-warning';
  return collection.online ? 'chip chip-success' : 'chip';
});
</script>

<template>
  <button
    :class="tono"
    :disabled="collection.syncing"
    :title="collection.online ? 'Tocar para sincronizar' : 'Sin conexión con el NAS. Tocar para reintentar'"
    @click="collection.sync()"
  >
    {{ texto }}
  </button>
</template>
