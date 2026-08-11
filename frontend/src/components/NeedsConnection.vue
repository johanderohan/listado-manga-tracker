<script setup>
defineProps({
  accion: { type: String, default: 'esta pantalla' }
});
</script>

<template>
  <div class="card p-6 text-center">
    <p class="text-sm text-ink-dim">
      Para {{ accion }} hace falta conexión con el NAS. Conéctate a la VPN o a la
      wifi de casa y vuelve a intentarlo.
    </p>
  </div>
</template>
