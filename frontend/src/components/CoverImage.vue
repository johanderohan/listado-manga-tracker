<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  // Ratio nativo de las portadas de listadomanga (108x150) para no
  // recortarlas/estirarlas con object-cover.
  ratio: { type: String, default: 'aspect-[108/150]' }
});

const loaded = ref(false);
const errored = ref(false);

watch(
  () => props.src,
  () => {
    loaded.value = false;
    errored.value = false;
  }
);
</script>

<template>
  <div :class="['relative w-full overflow-hidden bg-manga-surface', ratio]">
    <div v-if="!loaded && !errored" class="absolute inset-0 skeleton"></div>
    <img
      v-if="src && !errored"
      :src="src"
      :alt="alt"
      loading="lazy"
      class="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
      :class="loaded ? 'opacity-100' : 'opacity-0'"
      @load="loaded = true"
      @error="errored = true"
    />
    <div
      v-if="errored || !src"
      class="absolute inset-0 flex items-center justify-center text-ink-dim text-xs px-2 text-center"
    >
      <span>sin portada</span>
    </div>
  </div>
</template>
