<script setup>
defineProps({
  title: { type: String, default: 'Sin resultados' },
  description: { type: String, default: '' },
  icon: { type: String, default: 'search' }
});
</script>

<template>
  <div class="surface p-10 text-center">
    <div
      class="mx-auto w-12 h-12 rounded-2xl bg-manga-surface flex items-center justify-center mb-4 ring-1 ring-manga-line"
    >
      <svg
        v-if="icon === 'search'"
        class="w-6 h-6 text-ink-dim"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M21 21l-4.3-4.3M10 18a8 8 0 110-16 8 8 0 010 16z" />
      </svg>
      <svg
        v-else-if="icon === 'book'"
        class="w-6 h-6 text-ink-dim"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5V5a2 2 0 012-2h13a1 1 0 011 1v14m-16 1.5A2.5 2.5 0 006.5 22H20" />
      </svg>
      <svg
        v-else-if="icon === 'heart'"
        class="w-6 h-6 text-manga-accent"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </div>
    <h3 class="display text-2xl tracking-wider">{{ title }}</h3>
    <p v-if="description" class="text-ink-muted mt-1 text-sm">{{ description }}</p>
    <div class="mt-4">
      <slot />
    </div>
  </div>
</template>
