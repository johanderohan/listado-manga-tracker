<script setup>
import { computed } from 'vue';
import CoverImage from './CoverImage.vue';
import { useLongPress } from '../composables/useLongPress.js';

const props = defineProps({
  vol: { type: Object, required: true }
});
const emit = defineEmits(['select', 'longpress']);

const isReleased = computed(() => props.vol.is_released !== 0);
const owned = computed(() => !!props.vol.owned);

// Long-press solo tiene sentido en tomos no publicados (para marcarlos
// como comprados pese a no estar editados aún).
const { pressing, handlers } = useLongPress(() => emit('longpress', props.vol), {
  threshold: 500
});

function onClick() {
  if (isReleased.value) emit('select', props.vol);
}

const statusText = computed(() => {
  if (owned.value) return '✓ Comprado';
  if (!isReleased.value) return props.vol.release_date || 'No editado';
  return 'Pendiente';
});
</script>

<template>
  <div
    class="card cursor-pointer select-none transition-transform"
    :class="[
      owned ? 'ring-2 ring-manga-accent' : '',
      !isReleased && !owned ? 'opacity-60' : '',
      pressing ? 'scale-95' : ''
    ]"
    v-on="!isReleased && !owned ? handlers : {}"
    @click="onClick"
  >
    <div class="relative">
      <CoverImage :src="vol.cover_url" :alt="`Tomo ${vol.number}`" />
      <div
        v-if="owned"
        class="absolute top-2 right-2 w-7 h-7 rounded-full bg-manga-accent text-white
               flex items-center justify-center text-sm shadow-lg"
      >
        ✓
      </div>
    </div>
    <div class="p-3">
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-medium">Tomo {{ vol.number }}</span>
        <span
          v-if="(isReleased || owned) && vol.price > 0"
          class="text-xs text-ink-dim"
        >
          {{ vol.price.toFixed(2) }}€
        </span>
      </div>
      <div
        class="mt-1 text-xs"
        :class="owned ? 'text-manga-accent' : 'text-ink-muted'"
      >
        {{ statusText }}
      </div>
    </div>
  </div>
</template>
