<script setup>
import { ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

const route = useRoute();
const open = ref(false);

const links = [
  { to: { name: 'home' }, label: 'Inicio' },
  { to: { name: 'my-series' }, label: 'Mis Series' },
  { to: { name: 'wishlist' }, label: 'Wishlist' },
  { to: { name: 'stats' }, label: 'Estadísticas' },
  { to: { name: 'search' }, label: 'Buscar' }
];

// Cierra el menú móvil al navegar.
watch(() => route.fullPath, () => { open.value = false; });
</script>

<template>
  <header class="sticky top-0 z-30 backdrop-blur-md bg-manga-dark/70 border-b border-manga-line">
    <div class="container-app flex items-center justify-between gap-4 h-16">
      <RouterLink :to="{ name: 'home' }" class="group shrink-0" @click="open = false">
        <span
          class="display text-xl sm:text-2xl tracking-wider whitespace-nowrap group-hover:text-manga-accent transition-colors"
        >
          MANGA TRACKER
        </span>
      </RouterLink>

      <!-- Nav escritorio -->
      <nav class="hidden md:flex items-center gap-1 lg:gap-2">
        <RouterLink
          v-for="l in links"
          :key="l.label"
          :to="l.to"
          class="px-3 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap
                 text-ink-muted hover:text-ink hover:bg-white/5"
          exact-active-class="!text-manga-accent !bg-manga-accent/10"
        >
          {{ l.label }}
        </RouterLink>
      </nav>

      <!-- Botón hamburguesa (móvil) -->
      <button
        class="md:hidden btn-secondary !px-2.5"
        :aria-expanded="open"
        aria-label="Abrir menú"
        @click="open = !open"
      >
        <svg
          v-if="!open"
          width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        <svg
          v-else
          width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="6" y1="18" x2="18" y2="6" />
        </svg>
      </button>
    </div>

    <!-- Menú desplegable móvil -->
    <Transition name="fade">
      <nav
        v-if="open"
        class="md:hidden container-app pb-4 flex flex-col gap-1 border-t border-manga-line pt-2"
      >
        <RouterLink
          v-for="l in links"
          :key="l.label"
          :to="l.to"
          class="px-3 py-3 rounded-xl text-sm font-medium transition-colors
                 text-ink-muted hover:text-ink hover:bg-white/5"
          exact-active-class="!text-manga-accent !bg-manga-accent/10"
        >
          {{ l.label }}
        </RouterLink>
      </nav>
    </Transition>
  </header>
</template>
