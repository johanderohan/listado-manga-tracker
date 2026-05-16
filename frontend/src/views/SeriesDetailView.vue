<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getSeries,
  getSeriesVolumes,
  getUserSeries,
  getWishlist,
  followSeries,
  deleteUserSeries,
  discardSeries,
  addToWishlist,
  removeFromWishlist,
  markVolumePurchased,
  unmarkVolumePurchased,
  markVolumesBulk,
  refreshSeries
} from '../services/api.js';
import { useConfirm } from '../composables/useConfirm.js';
import ProgressBar from '../components/ProgressBar.vue';
import ActionMenu from '../components/ActionMenu.vue';
import VolumeCard from '../components/VolumeCard.vue';

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

const series = ref(null);
const volumes = ref([]);
const loading = ref(true);
const error = ref(null);
const isFollowing = ref(false);
const isInWishlist = ref(false);
const refreshing = ref(false);
const info = ref(null);

const seriesId = computed(() => Number(route.params.id));

async function load() {
  loading.value = true;
  error.value = null;
  info.value = null;
  try {
    const [seriesData, userSeries, wishlist] = await Promise.all([
      getSeries(route.params.id),
      getUserSeries().catch(() => []),
      getWishlist().catch(() => [])
    ]);

    series.value = seriesData;
    volumes.value = seriesData.volumes || [];

    const userSerie = userSeries.find((s) => s.id === seriesId.value);
    isFollowing.value = !!userSerie && userSerie.status === 'following';
    isInWishlist.value = wishlist.some((w) => w.id === seriesId.value);

    if (userSerie) {
      volumes.value = await getSeriesVolumes(route.params.id);
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

// === Progreso ===
const releasedCount = computed(
  () => volumes.value.filter((v) => v.is_released !== 0).length
);
const ownedCount = computed(() => volumes.value.filter((v) => v.owned).length);
const totalCount = computed(() => volumes.value.length);
const isUpToDate = computed(
  () => ownedCount.value >= releasedCount.value && releasedCount.value > 0
);

// === Acciones ===
async function handleFollow() {
  const ok = await confirm({
    title: 'Añadir a tu colección',
    message: `¿Añadir «${series.value.name}» a tu colección?`,
    confirmText: 'Seguir serie'
  });
  if (!ok) return;
  try {
    await followSeries(route.params.id);
    isFollowing.value = true;
    volumes.value = await getSeriesVolumes(route.params.id);
  } catch (e) {
    error.value = e.message;
  }
}

async function handleDelete() {
  const ok = await confirm({
    title: 'Eliminar serie',
    message: `¿Eliminar «${series.value.name}» de tu colección? Esta acción no se puede deshacer.`,
    confirmText: 'Eliminar',
    danger: true
  });
  if (!ok) return;
  try {
    await deleteUserSeries(route.params.id);
    router.push({ name: 'my-series' });
  } catch (e) {
    error.value = e.message;
  }
}

async function handleDiscard() {
  const ok = await confirm({
    title: 'Descartar serie',
    message: `¿Descartar «${series.value.name}»? No aparecerá en tu lista principal.`,
    confirmText: 'Descartar'
  });
  if (!ok) return;
  try {
    await discardSeries(route.params.id);
    isFollowing.value = false;
  } catch (e) {
    error.value = e.message;
  }
}

async function handleToggleWishlist() {
  if (isInWishlist.value) {
    const ok = await confirm({
      title: 'Quitar de la wishlist',
      message: `¿Quitar «${series.value.name}» de tu wishlist?`,
      confirmText: 'Quitar',
      danger: true
    });
    if (!ok) return;
    try {
      await removeFromWishlist(route.params.id);
      isInWishlist.value = false;
    } catch (e) {
      error.value = e.message;
    }
  } else {
    const ok = await confirm({
      title: 'Añadir a la wishlist',
      message: `¿Añadir «${series.value.name}» a tu wishlist?`,
      confirmText: 'Añadir'
    });
    if (!ok) return;
    try {
      await addToWishlist(route.params.id);
      isInWishlist.value = true;
    } catch (e) {
      error.value = e.message;
    }
  }
}

async function handleToggleVolume(vol) {
  const owned = !!vol.owned;
  const ok = await confirm(
    owned
      ? {
          title: 'Desmarcar tomo',
          message: `¿Desmarcar el tomo ${vol.number} de «${series.value.name}»?`,
          confirmText: 'Desmarcar',
          danger: true
        }
      : {
          title: 'Marcar como comprado',
          message: `¿Marcar el tomo ${vol.number} de «${series.value.name}» como comprado?`,
          confirmText: 'Sí, comprado'
        }
  );
  if (!ok) return;
  try {
    if (owned) await unmarkVolumePurchased(route.params.id, vol.number);
    else await markVolumePurchased(route.params.id, vol.number);
    volumes.value = volumes.value.map((v) =>
      v.number === vol.number ? { ...v, owned: owned ? 0 : 1 } : v
    );
  } catch (e) {
    error.value = e.message;
  }
}

async function handleLongPressUnreleased(vol) {
  const ok = await confirm({
    title: 'Tomo no publicado',
    message: `Este tomo aún no se ha publicado. ¿Marcar el tomo ${vol.number} de «${series.value.name}» como comprado igualmente?`,
    confirmText: 'Marcar como comprado'
  });
  if (!ok) return;
  try {
    await markVolumePurchased(route.params.id, vol.number);
    volumes.value = volumes.value.map((v) =>
      v.number === vol.number ? { ...v, owned: 1 } : v
    );
  } catch (e) {
    error.value = e.message;
  }
}

async function handleMarkAll() {
  const unpurchased = volumes.value
    .filter((v) => !v.owned && v.is_released !== 0)
    .map((v) => v.number);
  if (unpurchased.length === 0) return;
  const ok = await confirm({
    title: 'Marcar todos',
    message: `¿Marcar ${unpurchased.length} tomos de «${series.value.name}» como comprados?`,
    confirmText: `Marcar ${unpurchased.length} tomos`
  });
  if (!ok) return;
  try {
    await markVolumesBulk(route.params.id, unpurchased);
    volumes.value = volumes.value.map((v) =>
      v.is_released !== 0 ? { ...v, owned: 1 } : v
    );
  } catch (e) {
    error.value = e.message;
  }
}

async function handleRefresh() {
  refreshing.value = true;
  error.value = null;
  try {
    const result = await refreshSeries(route.params.id);
    series.value = result.series;
    volumes.value = result.series.volumes || [];
    info.value = result.message;
  } catch (e) {
    error.value = 'Error al actualizar: ' + e.message;
  } finally {
    refreshing.value = false;
  }
}

const menuOptions = computed(() => [
  { label: 'Marcar todos', action: handleMarkAll },
  { label: 'Descartar', action: handleDiscard },
  { label: 'Eliminar', action: handleDelete, isDanger: true }
]);

watch(() => route.params.id, load);
onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <button class="btn-secondary" @click="router.back()">← Volver</button>
      <button
        v-if="series"
        class="btn-secondary"
        :disabled="refreshing"
        @click="handleRefresh"
      >
        {{ refreshing ? 'Actualizando…' : '↻ Actualizar datos' }}
      </button>
    </div>

    <div v-if="loading" class="surface p-8">
      <div class="h-6 w-1/2 skeleton rounded mb-4"></div>
      <div class="h-3 w-3/4 skeleton rounded mb-2"></div>
      <div class="h-3 w-2/3 skeleton rounded"></div>
    </div>

    <div v-else-if="error && !series" class="surface p-4 text-sm text-red-400">
      Error: {{ error }}
    </div>

    <template v-else-if="series">
      <div v-if="info" class="surface p-4 text-sm text-emerald-400">{{ info }}</div>
      <div v-if="error" class="surface p-4 text-sm text-red-400">{{ error }}</div>

      <div class="surface p-6 relative">
        <div v-if="isFollowing" class="absolute top-4 right-4">
          <ActionMenu :options="menuOptions" />
        </div>

        <h1 class="display text-3xl tracking-wide pr-12">{{ series.name }}</h1>
        <p v-if="series.original_name" class="text-ink-muted text-sm mt-1">
          {{ series.original_name }}
        </p>

        <div class="mt-4 space-y-1 text-sm">
          <p v-if="series.editorial_es">
            <span class="text-ink-dim">Editorial:</span> {{ series.editorial_es }}
          </p>
          <p v-if="series.artist">
            <span class="text-ink-dim">Dibujo:</span> {{ series.artist }}
          </p>
          <p v-if="series.reading_direction">
            <span class="text-ink-dim">Sentido de lectura:</span> {{ series.reading_direction }}
          </p>
        </div>

        <span
          class="mt-3 inline-block"
          :class="series.is_complete ? 'chip chip-success' : 'chip chip-warning'"
        >
          {{ series.is_complete ? 'Serie completa' : 'En publicación' }}
        </span>

        <p v-if="series.synopsis" class="mt-4 text-sm text-ink-muted leading-relaxed">
          {{ series.synopsis }}
        </p>

        <a
          v-if="series.url"
          :href="series.url"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-4 inline-block text-sm text-manga-accent hover:underline"
        >
          Ver en ListadoManga.es →
        </a>

        <!-- Progreso (siguiendo) o acciones (no siguiendo) -->
        <div v-if="isFollowing" class="mt-6 space-y-4 max-w-md">
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-ink-dim">Publicados</span>
              <span v-if="isUpToDate" class="chip chip-success">Al día</span>
            </div>
            <ProgressBar :owned="ownedCount" :total="releasedCount" :show-label="true" />
          </div>
          <div v-if="totalCount > releasedCount">
            <ProgressBar
              :owned="ownedCount"
              :total="totalCount"
              label="Total (con no editados)"
              secondary
            />
          </div>
        </div>
        <div v-else class="mt-6 flex flex-wrap gap-3">
          <button class="btn-primary" @click="handleFollow">Seguir serie</button>
          <button
            :class="isInWishlist ? 'btn-secondary' : 'btn-primary'"
            @click="handleToggleWishlist"
          >
            {{ isInWishlist ? 'En Wishlist ✓' : 'Añadir a Wishlist' }}
          </button>
        </div>
      </div>

      <!-- Tomos -->
      <section v-if="isFollowing && volumes.length > 0" class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="display text-2xl tracking-wide">Tomos</h2>
          <span class="text-xs text-ink-dim">
            Mantén pulsado un tomo no publicado para marcarlo
          </span>
        </div>
        <div class="grid-covers">
          <VolumeCard
            v-for="vol in volumes"
            :key="vol.number"
            :vol="vol"
            @select="handleToggleVolume"
            @longpress="handleLongPressUnreleased"
          />
        </div>
      </section>

      <section
        v-else-if="!isFollowing && volumes.length > 0"
        class="surface p-6 text-center"
      >
        <p class="text-ink">Tomos disponibles: {{ volumes.length }}</p>
        <p class="text-ink-muted text-sm mt-1">
          Sigue esta serie para gestionar tus compras
        </p>
      </section>
    </template>
  </div>
</template>
