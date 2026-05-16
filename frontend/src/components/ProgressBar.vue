<script setup>
import { computed } from 'vue';

const props = defineProps({
  owned: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  label: { type: String, default: '' },
  showLabel: { type: Boolean, default: true },
  secondary: { type: Boolean, default: false }
});

const pct = computed(() => (props.total ? Math.round((props.owned / props.total) * 100) : 0));
const isFull = computed(() => props.total > 0 && props.owned >= props.total);
</script>

<template>
  <div class="w-full">
    <div v-if="showLabel" class="flex items-center justify-between text-xs mb-1 text-ink-muted">
      <span>
        <span v-if="label" class="text-ink-dim mr-1">{{ label }}</span>
        <span :class="isFull ? 'text-manga-accent font-medium' : ''">
          {{ owned }}/{{ total }} tomos
        </span>
      </span>
      <span :class="isFull ? 'text-manga-accent font-medium' : ''">{{ pct }}%</span>
    </div>
    <div class="w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-manga-line h-1.5">
      <div
        class="h-full transition-all duration-500 ease-out"
        :class="
          secondary
            ? 'bg-manga-accent/40'
            : isFull
              ? 'bg-manga-accent'
              : 'bg-manga-accent/70'
        "
        :style="{ width: pct + '%' }"
      ></div>
    </div>
  </div>
</template>
