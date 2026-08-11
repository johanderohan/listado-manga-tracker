<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getSeries,
  followSeries,
  deleteUserSeries,
  discardSeries,
  addToWishlist,
  removeFromWishlist,
  markVolumesBulk,
  refreshSeries
} from '../services/api.js';
import { useCollectionStore } from '../stores/collection.js';
import { useConfirm } from '../composables/useConfirm.js';
import ProgressBar from '../components/ProgressBar.vue';
import ActionMenu from '../components/ActionMenu.vue';
import VolumeCard from '../components/VolumeCard.vue';
import NeedsConnection from '../components/NeedsConnection.vue';

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const collection = useCollectionStore();

const error = ref(null);
const info = ref(null);
const refreshing = ref(false);

// Serie que no está en la colección: se llega aquí desde el buscador remoto,
// así que hay que pedirla al API. Solo funciona con conexión, y es correcto:
// añadir una serie nueva la necesita igualmente.
const remote = ref(null);
const remoteLoading = ref(false);

const seriesId = computed(() => Number(route.params.id));
const local = computed(() => collection.detail(seriesId.value));
const series = computed(() => local.value ?? remote.value);
const volumes = computed(() => series.value?.volumes ?? []);

const isFollowing = computed(() => local.value?.status === 'following');
const isInWishlist = computed(() => collection.wishlist.some((w) => w.id === seriesId.value));

async function cargarRemota() {
  remote.value = null;
  if (local.value) return;

  remoteLoading.value = true;
  try {
    remote.value = await getSeries(route.params.id);
  } catch (e) {
    error.value = e.message;
  } finally {
    remoteLoading.value = false;
  }
}

// === Progreso ===
const releasedCount = computed(() => volumes.value.filter((v) => v.is_released !== 0).length);
const ownedCount = computed(() => volumes.value.filter((v) => v.owned).length);
const totalCount = computed(() => volumes.value.length);
const isUpToDate = computed(() => ownedCount.value >= releasedCount.value && releasedCount.value > 0);

// === Acciones que necesitan conexión ===
async function handleFollow() {
  const ok = await confirm({
    title: 'Añadir a tu colección',
    message: `¿Añadir «${series.value.name}» a tu colección?`,
    confirmText: 'Seguir serie'
  });
  if (!ok) return;
  try {
    await followSeries(route.params.id);
    await collection.sync();
    remote.value = null;
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
    await collection.sync();
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
    await collection.sync();
  } catch (e) {
    error.value = e.message;
  }
}

async function handleToggleWishlist() {
  const quitando = isInWishlist.value;
  const ok = await confirm(
    quitando
      ? {
          title: 'Quitar de la wishlist',
          message: `¿Quitar «${series.value.name}» de tu wishlist?`,
          confirmText: 'Quitar',
          danger: true
        }
      : {
          title: 'Añadir a la wishlist',
          message: `¿Añadir «${series.value.name}» a tu wishlist?`,
          confirmText: 'Añadir'
        }
  );
  if (!ok) return;
  try {
    if (quitando) await removeFromWishlist(route.params.id);
    else await addToWishlist(route.params.id);
    await collection.sync();
  } catch (e) {
    error.value = e.message;
  }
}

async function handleRefresh() {
  refreshing.value = true;
  error.value = null;
  try {
    const result = await refreshSeries(route.params.id);
    info.value = result.message;
    await collection.sync();
  } catch (e) {
    error.value = 'Error al actualizar: ' + e.message;
  } finally {
    refreshing.value = false;
  }
}

// === Acciones que funcionan sin conexión ===
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

  if (owned) collection.desmarcarComprado(seriesId.value, vol.number);
  else collection.marcarComprado(seriesId.value, vol.number);
}

async function handleLongPressUnreleased(vol) {
  const ok = await confirm({
    title: 'Tomo no publicado',
    message: `Este tomo aún no se ha publicado. ¿Marcar el tomo ${vol.number} de «${series.value.name}» como comprado igualmente?`,
    confirmText: 'Marcar como comprado'
  });
  if (!ok) return;
  collection.marcarComprado(seriesId.value, vol.number);
}

async function handleMarkAll() {
  const unpurchased = volumes.value.filter((v) => !v.owned && v.is_released !== 0).map((v) => v.number);
  if (unpurchased.length === 0) return;

  const ok = await confirm({
    title: 'Marcar todos',
    message: `¿Marcar ${unpurchased.length} tomos de «${series.value.name}» como comprados?`,
    confirmText: `Marcar ${unpurchased.length} tomos`
  });
  if (!ok) return;

  // Con conexión va en una sola petición; sin ella, a la cola uno a uno, que
  // es lo único posible pero también lo más lento de reproducir.
  if (collection.online) {
    try {
      await markVolumesBulk(route.params.id, unpurchased);
      await collection.sync();
      return;
    } catch (e) {
      error.value = e.message;
    }
  }

  for (const n of unpurchased) collection.marcarComprado(seriesId.value, n);
}

const menuOptions = computed(() => [
  { label: 'Marcar todos', action: handleMarkAll },
  { label: 'Descartar', action: handleDiscard },
  { label: 'Eliminar', action: handleDelete, isDanger: true }
]);

watch(() => route.params.id, cargarRemota);
onMounted(cargarRemota);
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <button class="btn-secondary" @click="router.back()">← Volver</button>
      <button
        v-if="series && collection.online"
        class="btn-secondary"
        :disabled="refreshing"
        @click="handleRefresh"
      >
        {{ refreshing ? 'Actualizando…' : '↻ Actualizar datos' }}
      </button>
    </div>

    <div v-if="remoteLoading" class="surface p-8">
      <div class="h-6 w-1/2 skeleton rounded mb-4"></div>
      <div class="h-3 w-3/4 skeleton rounded mb-2"></div>
      <div class="h-3 w-2/3 skeleton rounded"></div>
    </div>

    <NeedsConnection v-else-if="!series" accion="ver una serie que no tienes en tu colección" />

    <template v-else>
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
        <div v-else-if="collection.online" class="mt-6 flex flex-wrap gap-3">
          <button class="btn-primary" @click="handleFollow">Seguir serie</button>
          <button
            :class="isInWishlist ? 'btn-secondary' : 'btn-primary'"
            @click="handleToggleWishlist"
          >
            {{ isInWishlist ? 'En Wishlist ✓' : 'Añadir a Wishlist' }}
          </button>
        </div>
        <NeedsConnection v-else class="mt-6" accion="seguir esta serie o tocar la wishlist" />
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
