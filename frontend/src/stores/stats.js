import { defineStore } from 'pinia';
import { getStats } from '../services/api.js';

// Estadísticas de la colección. Compartidas para que, al marcar un tomo
// como comprado desde la Home, el contador se actualice al instante sin
// recargar (como hacía Home.jsx con setStats).
export const useStatsStore = defineStore('stats', {
  state: () => ({
    data: null,
    loading: false,
    error: null
  }),

  actions: {
    async load() {
      this.loading = true;
      this.error = null;
      try {
        this.data = await getStats();
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },

    bumpVolumes(delta) {
      if (this.data) this.data.totalVolumes += delta;
    }
  }
});
