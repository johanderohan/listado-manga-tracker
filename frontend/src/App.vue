<script setup>
import { RouterView } from 'vue-router';
import Navbar from './components/Navbar.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
</script>

<template>
  <div class="min-h-full flex flex-col">
    <Navbar />

    <main class="flex-1 container-app py-6">
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <footer class="border-t border-manga-line mt-12">
      <div class="container-app py-6 text-xs text-ink-dim flex flex-wrap gap-2 justify-between">
        <span>Manga Tracker · colección personal</span>
        <span>Datos cortesía de ListadoManga.es</span>
      </div>
    </footer>

    <!-- Diálogo de confirmación global (montado una sola vez) -->
    <ConfirmDialog />
  </div>
</template>
