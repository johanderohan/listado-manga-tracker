<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { getStatistics } from '../services/api.js';
import EmptyState from '../components/EmptyState.vue';

const data = ref(null);
const loading = ref(true);
const error = ref(null);

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function eur(n) {
  return `${(Number(n) || 0).toFixed(2)}€`;
}
function fmtMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES');
}

async function load() {
  loading.value = true;
  try {
    data.value = await getStatistics();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const s = computed(() => data.value?.summary || {});

// --- KPIs ---
const kpis = computed(() => {
  const x = s.value;
  return [
    { label: 'Series seguidas', value: x.followingSeries ?? 0 },
    { label: 'Tomos en propiedad', value: x.totalVolumesOwned ?? 0 },
    { label: 'Series completas', value: x.completedSeries ?? 0 },
    { label: 'En wishlist', value: x.wishlistCount ?? 0 },
    { label: 'Descartadas', value: x.discardedSeries ?? 0 },
    { label: 'Inversión total', value: eur(x.totalSpent) },
    { label: 'Precio medio/tomo', value: eur(x.avgVolumePrice) },
    { label: 'Tomo más caro', value: eur(x.maxVolumePrice) },
    { label: 'Pendientes (publicados)', value: x.pendingCount ?? 0 },
    { label: 'Coste de pendientes', value: eur(x.pendingCost) },
    { label: 'Próximos lanzamientos', value: x.upcomingCount ?? 0 },
    { label: 'Media tomos/mes', value: data.value?.milestones?.avgPerMonth ?? 0 }
  ];
});

// --- Mapa de calor (últimos ~12 meses, estilo calendario) ---
const heatmap = computed(() => {
  const byDay = new Map((data.value?.purchasesByDay || []).map((d) => [d.date, d.count]));
  const max = Math.max(1, ...Array.from(byDay.values()));

  const end = new Date();
  end.setHours(0, 0, 0, 0);
  // Avanzar hasta el sábado de la semana actual
  const endAligned = new Date(end);
  endAligned.setDate(endAligned.getDate() + (6 - endAligned.getDay()));
  const start = new Date(endAligned);
  start.setDate(start.getDate() - 7 * 53 + 1); // ~53 semanas
  // Retroceder hasta domingo
  start.setDate(start.getDate() - start.getDay());

  const weeks = [];
  let cur = new Date(start);
  while (cur <= endAligned) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(
        cur.getDate()
      ).padStart(2, '0')}`;
      const count = byDay.get(iso) || 0;
      const future = cur > end;
      const level = future ? -1 : count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
      week.push({ iso, count, level, future, month: cur.getMonth() });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  // Etiquetas de mes: primera semana donde aparece un mes nuevo
  const monthLabels = weeks.map((w, idx) => {
    const m = w[0].month;
    const prev = idx > 0 ? weeks[idx - 1][0].month : -1;
    return m !== prev ? MONTHS[m] : '';
  });
  return { weeks, monthLabels };
});

const levelClass = (lvl) =>
  ({
    '-1': 'bg-transparent',
    0: 'bg-white/5',
    1: 'bg-manga-accent/25',
    2: 'bg-manga-accent/45',
    3: 'bg-manga-accent/70',
    4: 'bg-manga-accent'
  }[lvl]);

// --- Timeline mensual ---
const months = computed(() => {
  const list = data.value?.purchasesByMonth || [];
  const max = Math.max(1, ...list.map((m) => m.count));
  return list.map((m) => ({ ...m, pct: Math.round((m.count / max) * 100) }));
});

// --- Días de la semana ---
const weekdayBars = computed(() => {
  const by = new Map((data.value?.purchasesByWeekday || []).map((w) => [w.weekday, w.count]));
  const arr = WEEKDAYS.map((label, i) => ({ label, count: by.get(i) || 0 }));
  const max = Math.max(1, ...arr.map((a) => a.count));
  return arr.map((a) => ({ ...a, pct: Math.round((a.count / max) * 100) }));
});

// --- Editorial ---
const editorials = computed(() => {
  const list = data.value?.byEditorial || [];
  const max = Math.max(1, ...list.map((e) => e.volumesOwned));
  return list.slice(0, 12).map((e) => ({ ...e, pct: Math.round((e.volumesOwned / max) * 100) }));
});

const readingDirs = computed(() => {
  const list = data.value?.byReadingDirection || [];
  const total = list.reduce((a, b) => a + b.count, 0) || 1;
  return list.map((d) => ({ ...d, pct: Math.round((d.count / total) * 100) }));
});

const topSeries = computed(() =>
  (data.value?.topSeries || []).map((t) => ({
    ...t,
    pct: t.total > 0 ? Math.min(100, Math.round((t.owned / t.total) * 100)) : 0
  }))
);
</script>

<template>
  <div class="space-y-8">
    <h1 class="display text-3xl tracking-wide">Estadísticas</h1>

    <div v-if="loading" class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div v-for="i in 8" :key="i" class="surface p-4 h-20 skeleton"></div>
    </div>

    <div v-else-if="error" class="surface p-4 text-sm text-red-400">Error: {{ error }}</div>

    <EmptyState
      v-else-if="!s.totalVolumesOwned && !s.followingSeries"
      icon="book"
      title="Aún no hay datos"
      description="Sigue series y marca tomos como comprados para ver tus estadísticas"
    >
      <RouterLink :to="{ name: 'search' }" class="btn-primary">Buscar series</RouterLink>
    </EmptyState>

    <template v-else>
      <!-- KPIs -->
      <section class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div v-for="k in kpis" :key="k.label" class="surface p-4 text-center">
          <div class="display text-2xl text-manga-accent">{{ k.value }}</div>
          <div class="text-xs text-ink-muted mt-1">{{ k.label }}</div>
        </div>
      </section>

      <!-- Hitos -->
      <section class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="surface p-4">
          <div class="text-xs text-ink-dim">Primera compra</div>
          <div class="text-sm mt-1">{{ fmtDate(s.firstPurchase) }}</div>
        </div>
        <div class="surface p-4">
          <div class="text-xs text-ink-dim">Última compra</div>
          <div class="text-sm mt-1">{{ fmtDate(s.lastPurchase) }}</div>
        </div>
        <div class="surface p-4">
          <div class="text-xs text-ink-dim">Mejor mes</div>
          <div class="text-sm mt-1">
            {{ data.milestones.bestMonth
              ? `${fmtMonth(data.milestones.bestMonth.ym)} · ${data.milestones.bestMonth.count}`
              : '—' }}
          </div>
        </div>
        <div class="surface p-4">
          <div class="text-xs text-ink-dim">Día más activo</div>
          <div class="text-sm mt-1">
            {{ data.milestones.busiestDay
              ? `${fmtDate(data.milestones.busiestDay.date)} · ${data.milestones.busiestDay.count}`
              : '—' }}
          </div>
        </div>
      </section>

      <!-- Mapa de calor -->
      <section class="surface p-5">
        <h2 class="display text-xl tracking-wide mb-4">Mapa de calor de compras</h2>
        <div class="overflow-x-auto">
          <div class="inline-flex flex-col gap-1 min-w-max">
            <div class="flex gap-[3px] pl-8">
              <div
                v-for="(lbl, i) in heatmap.monthLabels"
                :key="i"
                class="w-3 text-[9px] text-ink-dim"
              >
                {{ lbl }}
              </div>
            </div>
            <div class="flex gap-[3px]">
              <div class="flex flex-col gap-[3px] pr-1 justify-between text-[9px] text-ink-dim">
                <span class="h-3"></span>
                <span class="h-3">Lun</span>
                <span class="h-3"></span>
                <span class="h-3">Mié</span>
                <span class="h-3"></span>
                <span class="h-3">Vie</span>
                <span class="h-3"></span>
              </div>
              <div v-for="(week, wi) in heatmap.weeks" :key="wi" class="flex flex-col gap-[3px]">
                <div
                  v-for="day in week"
                  :key="day.iso"
                  class="w-3 h-3 rounded-[2px]"
                  :class="levelClass(day.level)"
                  :title="day.future ? '' : `${day.iso}: ${day.count} tomo(s)`"
                ></div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 mt-3 text-[10px] text-ink-dim">
          <span>Menos</span>
          <div class="w-3 h-3 rounded-[2px] bg-white/5"></div>
          <div class="w-3 h-3 rounded-[2px] bg-manga-accent/25"></div>
          <div class="w-3 h-3 rounded-[2px] bg-manga-accent/45"></div>
          <div class="w-3 h-3 rounded-[2px] bg-manga-accent/70"></div>
          <div class="w-3 h-3 rounded-[2px] bg-manga-accent"></div>
          <span>Más</span>
        </div>
      </section>

      <!-- Timeline mensual -->
      <section class="surface p-5">
        <h2 class="display text-xl tracking-wide mb-4">Compras por mes</h2>
        <div v-if="months.length" class="overflow-x-auto">
          <div class="flex items-end gap-2 h-44 min-w-max">
            <div
              v-for="m in months"
              :key="m.ym"
              class="flex flex-col items-center gap-1 w-10"
              :title="`${fmtMonth(m.ym)}: ${m.count} tomos · ${eur(m.spent)}`"
            >
              <span class="text-[10px] text-ink-muted">{{ m.count }}</span>
              <div class="w-full bg-white/5 rounded-t flex items-end" style="height: 120px">
                <div
                  class="w-full bg-manga-accent/70 rounded-t transition-all"
                  :style="{ height: m.pct + '%' }"
                ></div>
              </div>
              <span class="text-[9px] text-ink-dim whitespace-nowrap">{{ fmtMonth(m.ym) }}</span>
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-ink-muted">Sin datos.</p>
      </section>

      <div class="grid md:grid-cols-2 gap-6">
        <!-- Días de la semana -->
        <section class="surface p-5">
          <h2 class="display text-xl tracking-wide mb-4">Por día de la semana</h2>
          <div class="space-y-2">
            <div v-for="d in weekdayBars" :key="d.label" class="flex items-center gap-3">
              <span class="w-10 text-xs text-ink-muted">{{ d.label }}</span>
              <div class="flex-1 bg-white/5 rounded-full h-3 overflow-hidden">
                <div class="h-full bg-manga-accent/70" :style="{ width: d.pct + '%' }"></div>
              </div>
              <span class="w-8 text-right text-xs text-ink-dim">{{ d.count }}</span>
            </div>
          </div>
        </section>

        <!-- Sentido de lectura -->
        <section class="surface p-5">
          <h2 class="display text-xl tracking-wide mb-4">Sentido de lectura</h2>
          <div class="space-y-2">
            <div v-for="d in readingDirs" :key="d.direction" class="flex items-center gap-3">
              <span class="w-24 text-xs text-ink-muted truncate">{{ d.direction }}</span>
              <div class="flex-1 bg-white/5 rounded-full h-3 overflow-hidden">
                <div class="h-full bg-manga-accent/70" :style="{ width: d.pct + '%' }"></div>
              </div>
              <span class="w-14 text-right text-xs text-ink-dim">{{ d.count }} · {{ d.pct }}%</span>
            </div>
            <p v-if="!readingDirs.length" class="text-sm text-ink-muted">Sin datos.</p>
          </div>
        </section>
      </div>

      <!-- Editorial -->
      <section class="surface p-5">
        <h2 class="display text-xl tracking-wide mb-4">Por editorial</h2>
        <div class="space-y-2">
          <div v-for="e in editorials" :key="e.editorial" class="flex items-center gap-3">
            <span class="w-36 text-xs text-ink-muted truncate" :title="e.editorial">
              {{ e.editorial }}
            </span>
            <div class="flex-1 bg-white/5 rounded-full h-3 overflow-hidden">
              <div class="h-full bg-manga-accent/70" :style="{ width: e.pct + '%' }"></div>
            </div>
            <span class="w-40 text-right text-xs text-ink-dim">
              {{ e.seriesCount }} series · {{ e.volumesOwned }} tomos · {{ eur(e.spent) }}
            </span>
          </div>
          <p v-if="!editorials.length" class="text-sm text-ink-muted">Sin datos.</p>
        </div>
      </section>

      <!-- Top series -->
      <section class="surface p-5">
        <h2 class="display text-xl tracking-wide mb-4">Series con más tomos</h2>
        <div class="space-y-3">
          <RouterLink
            v-for="t in topSeries"
            :key="t.id"
            :to="{ name: 'series-detail', params: { id: t.id } }"
            class="block hover:bg-white/5 rounded-lg p-2 -m-2 transition-colors"
          >
            <div class="flex items-center justify-between gap-3 mb-1">
              <span class="text-sm font-medium truncate">{{ t.name }}</span>
              <span class="text-xs text-ink-dim whitespace-nowrap">
                {{ t.owned }}/{{ t.total || '?' }} · {{ eur(t.spent) }}
              </span>
            </div>
            <div class="bg-white/5 rounded-full h-1.5 overflow-hidden">
              <div
                class="h-full"
                :class="t.is_complete && t.pct >= 100 ? 'bg-emerald-500' : 'bg-manga-accent/70'"
                :style="{ width: t.pct + '%' }"
              ></div>
            </div>
          </RouterLink>
          <p v-if="!topSeries.length" class="text-sm text-ink-muted">Sin datos.</p>
        </div>
      </section>

      <div class="grid md:grid-cols-2 gap-6">
        <!-- Completas y completadas -->
        <section class="surface p-5">
          <h2 class="display text-xl tracking-wide mb-4">
            Completas al 100% ({{ data.completedList.length }})
          </h2>
          <div class="flex flex-wrap gap-2">
            <RouterLink
              v-for="c in data.completedList"
              :key="c.id"
              :to="{ name: 'series-detail', params: { id: c.id } }"
              class="chip chip-success hover:ring-emerald-400/60"
            >
              {{ c.name }} ({{ c.total }})
            </RouterLink>
            <p v-if="!data.completedList.length" class="text-sm text-ink-muted">
              Ninguna serie completa terminada todavía.
            </p>
          </div>
        </section>

        <!-- Completas que faltan tomos -->
        <section class="surface p-5">
          <h2 class="display text-xl tracking-wide mb-4">
            Completas por terminar ({{ data.completedMissing.length }})
          </h2>
          <div class="space-y-2">
            <RouterLink
              v-for="c in data.completedMissing"
              :key="c.id"
              :to="{ name: 'series-detail', params: { id: c.id } }"
              class="flex items-center justify-between gap-3 text-sm hover:bg-white/5 rounded-lg p-2 -m-1 transition-colors"
            >
              <span class="truncate">{{ c.name }}</span>
              <span class="chip chip-warning shrink-0">faltan {{ c.missing }}</span>
            </RouterLink>
            <p v-if="!data.completedMissing.length" class="text-sm text-ink-muted">
              No te falta ninguna serie completa. ¡Enhorabuena!
            </p>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
