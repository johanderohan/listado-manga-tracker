<script setup>
import { watch, onUnmounted } from 'vue';
import { useConfirm } from '../composables/useConfirm.js';

const { state, _accept, _cancel } = useConfirm();

function onKeydown(e) {
  if (e.key === 'Escape') _cancel();
}

// Bloquea scroll del body y escucha Escape mientras está abierto.
watch(
  () => state.open,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onKeydown);
      document.body.style.overflow = 'hidden';
    } else {
      document.removeEventListener('keydown', onKeydown);
      document.body.style.overflow = '';
    }
  }
);

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
});
</script>

<template>
  <Transition name="fade">
    <div
      v-if="state.open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      @click.self="_cancel"
    >
      <div class="surface p-6 max-w-md w-full" role="dialog" aria-modal="true">
        <h3 class="display text-2xl tracking-wide mb-2">{{ state.title }}</h3>
        <p v-if="state.message" class="text-ink-muted text-sm leading-relaxed">
          {{ state.message }}
        </p>
        <div class="mt-6 flex gap-3 justify-end">
          <button class="btn-secondary" @click="_cancel">{{ state.cancelText }}</button>
          <button
            :class="state.danger ? 'btn-danger' : 'btn-primary'"
            @click="_accept"
          >
            {{ state.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
