<script setup>
defineProps({
  modelValue: { type: String, required: true },
  tabs: { type: Array, required: true } // [{ key, label, count? }]
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="t in tabs"
      :key="t.key"
      :class="modelValue === t.key ? 'btn-primary' : 'btn-secondary'"
      @click="$emit('update:modelValue', t.key)"
    >
      {{ t.label }}
      <span v-if="t.count !== undefined" class="opacity-70">({{ t.count }})</span>
    </button>
  </div>
</template>
