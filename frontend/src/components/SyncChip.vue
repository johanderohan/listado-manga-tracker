<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useCollectionStore } from '../stores/collection.js';

const collection = useCollectionStore();

const UNA_HORA = 60 * 60 * 1000;

// El estado depende del paso del tiempo, no solo de los datos: sin este tic la
// nube seguiría en verde para siempre tras una sincronización.
const ahora = ref(Date.now());
let temporizador = null;
onMounted(() => { temporizador = setInterval(() => { ahora.value = Date.now(); }, 60_000); });
onUnmounted(() => clearInterval(temporizador));

const antiguedad = computed(() =>
  collection.lastSyncAt ? ahora.value - new Date(collection.lastSyncAt).getTime() : Infinity
);

const alDia = computed(() => collection.online && antiguedad.value < UNA_HORA);
const pendientes = computed(() => collection.outbox.length);

function hace(ms) {
  if (!Number.isFinite(ms)) return 'nunca';
  const minutos = Math.round(ms / 60000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} días`;
}

// Todo el detalle vive en el title: el icono solo dice si te puedes fiar.
const descripcion = computed(() => {
  if (collection.syncing) return 'Sincronizando…';
  const cuando = `Última sincronización ${hace(antiguedad.value)}`;
  if (pendientes.value > 0) {
    return `${pendientes.value} cambio${pendientes.value > 1 ? 's' : ''} sin enviar · ${cuando}`;
  }
  return collection.online ? cuando : `Sin conexión · ${cuando}`;
});

const color = computed(() => {
  if (pendientes.value > 0) return 'text-amber-400';
  return alDia.value ? 'text-emerald-400/70' : 'text-ink-dim';
});
</script>

<template>
  <button
    class="relative p-1.5 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-50"
    :class="color"
    :title="descripcion"
    :aria-label="descripcion"
    :disabled="collection.syncing"
    @click="collection.sync()"
  >
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      :class="{ 'animate-pulse': collection.syncing }"
    >
      <!-- Nube siempre; el interior cambia según el estado. -->
      <path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.3 8.8 4.5 4.5 0 0 0 6.5 19h11Z" />
      <!-- Al día: visto. -->
      <polyline v-if="alDia && pendientes === 0" points="9.5 13.5 11.5 15.5 15 11.5" />

      <!-- Cambios sin enviar: flecha hacia arriba. -->
      <template v-else-if="pendientes > 0">
        <line x1="12" y1="16" x2="12" y2="10.5" />
        <polyline points="9.5 13 12 10.5 14.5 13" />
      </template>

      <!-- Sin conexión o datos de hace más de una hora: admiración. -->
      <template v-else>
        <line x1="12" y1="10.5" x2="12" y2="14" />
        <line x1="12" y1="16" x2="12" y2="16.1" />
      </template>
    </svg>

    <span
      v-if="pendientes > 0"
      class="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full
             bg-amber-400 text-manga-dark text-[10px] font-bold leading-[15px] text-center"
    >
      {{ pendientes }}
    </span>
  </button>
</template>
