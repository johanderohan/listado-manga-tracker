<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

defineProps({
  options: { type: Array, required: true } // [{ label, action, isDanger? }]
});

const open = ref(false);
const root = ref(null);

function toggle() {
  open.value = !open.value;
}

function onClickOutside(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false;
}

function pick(option) {
  open.value = false;
  option.action?.();
}

onMounted(() => document.addEventListener('mousedown', onClickOutside));
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside));
</script>

<template>
  <div ref="root" class="relative">
    <button
      class="btn-secondary !px-2.5"
      aria-label="Más opciones"
      @click="toggle"
    >
      <svg
        width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="19" r="1" />
      </svg>
    </button>
    <Transition name="fade">
      <ul
        v-if="open"
        class="absolute right-0 mt-2 min-w-[12rem] surface p-1 z-20 shadow-card"
      >
        <li
          v-for="(o, i) in options"
          :key="i"
          class="px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
          :class="
            o.isDanger
              ? 'text-red-400 hover:bg-red-500/10'
              : 'text-ink hover:bg-white/5'
          "
          @click="pick(o)"
        >
          {{ o.label }}
        </li>
      </ul>
    </Transition>
  </div>
</template>
