import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { readSnapshot, writeSnapshot, readOutbox, writeOutbox } from '../lib/storage.js';
import { crearOp, aplicarOp, encolar, replay } from '../lib/outbox.js';
import * as C from '../lib/collection.js';
import { fetchSnapshot, precargarPortadas } from '../services/sync.js';
import { markVolumePurchased, unmarkVolumePurchased } from '../services/api.js';

export const useCollectionStore = defineStore('collection', () => {
  const snapshot = ref(null);
  const outbox = ref([]);
  const syncing = ref(false);
  const lastSyncAt = ref(null);
  const online = ref(true);

  const index = computed(() => (snapshot.value ? C.indexSnapshot(snapshot.value) : null));
  const hasData = computed(() => snapshot.value !== null);

  const pending = computed(() => (snapshot.value ? C.pendingVolumes(snapshot.value, index.value) : []));
  const upcoming = computed(() => (snapshot.value ? C.upcomingVolumes(snapshot.value, index.value) : []));
  const recent = computed(() => (snapshot.value ? C.recentVolumes(snapshot.value, 50, index.value) : []));
  const series = computed(() => (snapshot.value ? C.mySeries(snapshot.value, index.value) : []));
  const wishlist = computed(() => (snapshot.value ? C.wishlistSeries(snapshot.value, index.value) : []));
  const stats = computed(() => (snapshot.value ? C.homeStats(snapshot.value, index.value) : null));

  const detail = (id) => (snapshot.value ? C.seriesDetail(snapshot.value, id, index.value) : null);

  // Lectura síncrona: se llama antes de montar la app para que la primera
  // pintura ya lleve datos.
  function hydrate() {
    snapshot.value = readSnapshot();
    outbox.value = readOutbox();
    lastSyncAt.value = snapshot.value?.generatedAt ?? null;
  }

  function persistir() {
    if (snapshot.value) writeSnapshot(snapshot.value);
    writeOutbox(outbox.value);
  }

  function aplicarLocal(tipo, seriesId, volumeNumber) {
    if (!snapshot.value) return;
    const op = crearOp(tipo, seriesId, volumeNumber, new Date().toISOString());
    snapshot.value = aplicarOp(snapshot.value, op);
    outbox.value = encolar(outbox.value, op);
    persistir();
  }

  const marcarComprado = (seriesId, n) => aplicarLocal('comprar', seriesId, n);
  const desmarcarComprado = (seriesId, n) => aplicarLocal('descomprar', seriesId, n);

  async function sync() {
    if (syncing.value) return;
    syncing.value = true;

    try {
      // El orden importa. Primero una petición con timeout de 2 s que hace de
      // sonda: si el NAS no está, se corta aquí y no se llega a tocar la cola,
      // que va por axios con timeout de 120 s y dejaría la sincronización
      // colgada dos minutos.
      let fresco = await fetchSnapshot();
      online.value = true;

      // Y solo entonces se vacía la cola, volviendo a pedir el snapshot
      // después: el primero es anterior a los cambios enviados y usarlo
      // desharía visualmente lo que marcaste sin conexión.
      if (outbox.value.length > 0) {
        const r = await replay(outbox.value, {
          comprar: (s, n) => markVolumePurchased(s, n),
          descomprar: (s, n) => unmarkVolumePurchased(s, n)
        });
        outbox.value = r.restantes;
        writeOutbox(outbox.value);

        if (r.enviadas > 0) fresco = await fetchSnapshot();
      }

      // Lo que siga en la cola (un envío que falló a medias) no está en el
      // snapshot del servidor: se reaplica encima para que esas marcas no se
      // vean desaparecer de golpe.
      let base = fresco;
      for (const op of outbox.value) base = aplicarOp(base, op);

      snapshot.value = base;
      lastSyncAt.value = fresco.generatedAt;
      writeSnapshot(base);

      precargarPortadas(pending.value.slice(0, 60).map((v) => v.cover_url || v.series_cover));
    } catch {
      // Sin conexión o NAS inalcanzable: se sigue con lo local, sin ruido.
      online.value = false;
    } finally {
      syncing.value = false;
    }
  }

  return {
    snapshot, outbox, syncing, lastSyncAt, online,
    hasData, pending, upcoming, recent, series, wishlist, stats, detail,
    hydrate, sync, marcarComprado, desmarcarComprado
  };
});
