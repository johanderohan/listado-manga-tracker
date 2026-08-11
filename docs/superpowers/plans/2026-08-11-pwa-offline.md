# PWA offline-first — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la app funcione entera desde el móvil sin VPN y sin cobertura: home, mis series con buscador, ficha de serie y wishlist, pudiendo marcar tomos comprados que se sincronizan al volver a casa.

**Architecture:** El backend gana un endpoint que devuelve toda la colección en una petición (~720 KB). El frontend la guarda en `localStorage`, la hidrata **antes de montar la app** y deriva cada pantalla con funciones puras en `src/lib/`, probadas con `node --test` sin navegador. Las escrituras van a una cola local que se reproduce al sincronizar. El service worker se reescribe para no esperar nunca a la red.

**Tech Stack:** Vue 3 + Pinia + Vite (frontend), Express + better-sqlite3 (backend), `node --test` como runner, sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-08-11-pwa-offline-design.md`

## Global Constraints

- **Sin dependencias nuevas** ni en frontend ni en backend. Nada de Vitest, jsdom, Workbox, `vite-plugin-pwa`, `idb` ni `dexie`.
- **ESM en todo el proyecto** (`"type": "module"` en ambos `package.json`).
- **Nunca esperar a la red para pintar.** La hidratación desde `localStorage` ocurre antes de montar la app; la sincronización va siempre en segundo plano con **timeout de 2 segundos**.
- **Paridad de datos con el backend.** Las derivaciones locales usan exactamente las mismas fórmulas y órdenes que el SQL actual; si un porcentaje o un orden cambia, es un fallo.
- **Claves de `localStorage`**: `lm.snapshot` y `lm.outbox`.
- **La lógica probable vive en `src/lib/`**, en módulos puros sin Vue, sin `window` y sin reloj propio: todo lo ambiental (storage, fetch, fecha) entra por parámetro.
- **Textos en español**; comentarios en español explicando el porqué.
- **Rama de trabajo:** `feat/pwa-offline`.

## Estructura de ficheros

**Se crean:**

| Fichero | Responsabilidad |
|---|---|
| `frontend/src/lib/storage.js` | Leer y escribir las dos claves, tolerando datos corruptos |
| `frontend/src/lib/collection.js` | Derivaciones del snapshot: pendientes, próximos, recientes, mis series, ficha, búsqueda, contadores |
| `frontend/src/lib/outbox.js` | Cola de escrituras: encolar, aplicar en local, reproducir |
| `frontend/src/services/sync.js` | Hidratar, sincronizar con timeout, precargar portadas de pendientes |
| `frontend/src/stores/collection.js` | Store de Pinia que expone el snapshot y sus derivaciones a las vistas |
| `frontend/src/components/SyncChip.vue` | Chip de estado de sincronización en la barra |
| `frontend/src/components/NeedsConnection.vue` | Aviso reutilizable para pantallas que requieren conexión |
| `frontend/test/storage.test.js` | Tests de almacenamiento |
| `frontend/test/collection.test.js` | Tests de derivaciones |
| `frontend/test/outbox.test.js` | Tests de la cola |
| `frontend/public/icon-192.png`, `icon-512.png` | Iconos reales del manifest |
| `backend/test/snapshot.test.js` | Tests del endpoint |

**Se modifican:**

| Fichero | Cambio |
|---|---|
| `backend/src/controllers/user.controller.js` | Nuevo `getSnapshot` |
| `backend/src/routes/user.routes.js` | Ruta `GET /snapshot` |
| `frontend/package.json` | Script `test` |
| `frontend/src/main.js` | Hidratar antes de montar y lanzar la sincronización |
| `frontend/src/views/HomeView.vue` | Leer del store en vez del API |
| `frontend/src/views/MySeriesView.vue` | Leer del store; búsqueda sin acentos |
| `frontend/src/views/SeriesDetailView.vue` | Leer del store; marcar tomos vía cola |
| `frontend/src/views/WishlistView.vue` | Leer del store; escrituras solo con conexión |
| `frontend/src/views/SearchView.vue`, `StatsView.vue` | Aviso de que requieren conexión |
| `frontend/src/components/Navbar.vue` | Incluir el chip de sincronización |
| `frontend/public/sw.js` | Reescritura completa de estrategias |
| `frontend/public/manifest.json` | Iconos correctos |

---

### Task 1: Endpoint de snapshot

**Files:**
- Modify: `backend/src/controllers/user.controller.js`
- Modify: `backend/src/routes/user.routes.js`
- Create: `backend/test/snapshot.test.js`

**Interfaces:**
- Consumes: `createSchema` de `src/models/database.js`.
- Produces: `getSnapshot(req, res)` → responde `{ generatedAt, lastRefresh, series[], volumes[], owned[], wishlist[] }`.

- [ ] **Step 1: Escribir el test que falla `backend/test/snapshot.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import db, { createSchema } from '../src/models/database.js';
import { getSnapshot } from '../src/controllers/user.controller.js';

// El singleton apunta a :memory: porque el script de test fija DB_PATH.
createSchema(db);

function reset() {
  for (const t of ['user_volumes', 'user_series', 'wishlist', 'volumes', 'series', 'app_config']) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
}

function addSeries(id, extra = {}) {
  const s = { name: `Serie ${id}`, synopsis: 'Sinopsis', total_volumes: 3, is_complete: 0, ...extra };
  db.prepare(`
    INSERT OR REPLACE INTO series (id, name, original_name, author, artist, editorial_es,
      total_volumes, released_volumes, is_complete, reading_direction, synopsis, url)
    VALUES (?, ?, 'Original', 'Autor', 'Artista', 'Norma', ?, ?, ?, 'derecha-izquierda', ?, 'https://x/1')
  `).run(id, s.name, s.total_volumes, s.total_volumes, s.is_complete, s.synopsis);
}

function addVolume(seriesId, number, extra = {}) {
  const v = { is_released: 1, price: 9.5, release_date: 'Mayo 2026', cover_url: `https://x/${number}.jpg`, ...extra };
  db.prepare(`
    INSERT OR REPLACE INTO volumes (series_id, number, title, pages, price, cover_url, is_released, release_date)
    VALUES (?, ?, ?, 200, ?, ?, ?, ?)
  `).run(seriesId, number, `Tomo ${number}`, v.price, v.cover_url, v.is_released, v.release_date);
}

function capture() {
  let body = null;
  return { res: { json: (b) => { body = b; } }, get: () => body };
}

test('devuelve las cuatro colecciones y las marcas de tiempo', () => {
  reset();
  addSeries(1);
  addVolume(1, 1);
  db.prepare("INSERT INTO user_series (series_id, status) VALUES (1, 'following')").run();
  db.prepare('INSERT INTO user_volumes (series_id, volume_number) VALUES (1, 1)').run();
  db.prepare("INSERT INTO app_config (key, value) VALUES ('last_refresh', '2026-08-11 07:04:12')").run();

  const c = capture();
  getSnapshot({}, c.res);
  const snap = c.get();

  assert.equal(snap.series.length, 1);
  assert.equal(snap.volumes.length, 1);
  assert.equal(snap.owned.length, 1);
  assert.deepEqual(snap.wishlist, []);
  assert.equal(snap.lastRefresh, '2026-08-11 07:04:12');
  assert.ok(snap.generatedAt);
});

test('la serie trae los campos que pinta la ficha', () => {
  reset();
  addSeries(1);
  db.prepare("INSERT INTO user_series (series_id, status) VALUES (1, 'following')").run();

  const c = capture();
  getSnapshot({}, c.res);
  const s = c.get().series[0];

  for (const campo of ['id', 'name', 'original_name', 'author', 'artist', 'editorial_es',
    'total_volumes', 'released_volumes', 'is_complete', 'reading_direction', 'synopsis', 'url', 'status']) {
    assert.ok(campo in s, `falta el campo ${campo}`);
  }
});

test('incluye las descartadas con su status', () => {
  reset();
  addSeries(1); addSeries(2);
  db.prepare("INSERT INTO user_series (series_id, status) VALUES (1, 'following')").run();
  db.prepare("INSERT INTO user_series (series_id, status) VALUES (2, 'discarded')").run();

  const c = capture();
  getSnapshot({}, c.res);
  const estados = Object.fromEntries(c.get().series.map(s => [s.id, s.status]));

  assert.equal(estados[1], 'following');
  assert.equal(estados[2], 'discarded');
});

test('incluye las series que solo están en la wishlist, con status nulo', () => {
  reset();
  addSeries(9);
  addVolume(9, 1);
  db.prepare('INSERT INTO wishlist (series_id, notes) VALUES (9, ?)').run('me interesa');

  const c = capture();
  getSnapshot({}, c.res);
  const snap = c.get();

  assert.equal(snap.series.length, 1);
  assert.equal(snap.series[0].status, null);
  assert.equal(snap.volumes.length, 1);
  assert.deepEqual(snap.wishlist, [{ series_id: 9, notes: 'me interesa' }]);
});

test('no incluye series ajenas a la colección', () => {
  reset();
  addSeries(1); addSeries(99);
  addVolume(99, 1);
  db.prepare("INSERT INTO user_series (series_id, status) VALUES (1, 'following')").run();

  const c = capture();
  getSnapshot({}, c.res);
  const snap = c.get();

  assert.deepEqual(snap.series.map(s => s.id), [1]);
  assert.equal(snap.volumes.length, 0);
});

test('los comprados llevan la fecha de compra', () => {
  reset();
  addSeries(1);
  addVolume(1, 1);
  db.prepare("INSERT INTO user_series (series_id, status) VALUES (1, 'following')").run();
  db.prepare("INSERT INTO user_volumes (series_id, volume_number, purchased_at) VALUES (1, 1, '2026-05-01 10:00:00')").run();

  const c = capture();
  getSnapshot({}, c.res);

  assert.equal(c.get().owned[0].purchased_at, '2026-05-01 10:00:00');
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `cd backend && npm test`
Expected: FAIL — `does not provide an export named 'getSnapshot'`.

- [ ] **Step 3: Añadir `getSnapshot` a `backend/src/controllers/user.controller.js`**

Al final del fichero:

```js
// === SNAPSHOT OFFLINE ===

// Series que el móvil necesita: las que sigues, las descartadas y las de la
// wishlist. Estas últimas pueden no estar en user_series, y sin ellas la
// wishlist se vería vacía sin conexión.
const SERIES_EN_SNAPSHOT = `
  SELECT series_id FROM user_series
  UNION
  SELECT series_id FROM wishlist
`;

// GET /api/user/snapshot — toda la colección en una petición, para el modo
// offline del móvil. Ronda los 720 KB con la colección actual.
export function getSnapshot(req, res) {
  const series = db.prepare(`
    SELECT s.id, s.name, s.original_name, s.author, s.artist, s.editorial_es,
           s.total_volumes, s.released_volumes, s.is_complete,
           s.reading_direction, s.synopsis, s.url, us.status
    FROM series s
    LEFT JOIN user_series us ON us.series_id = s.id
    WHERE s.id IN (${SERIES_EN_SNAPSHOT})
    ORDER BY s.name
  `).all();

  const volumes = db.prepare(`
    SELECT v.series_id, v.number, v.price, v.release_date, v.is_released, v.cover_url
    FROM volumes v
    WHERE v.series_id IN (${SERIES_EN_SNAPSHOT})
    ORDER BY v.series_id, v.number
  `).all();

  const owned = db.prepare('SELECT series_id, volume_number, purchased_at FROM user_volumes').all();
  const wishlist = db.prepare('SELECT series_id, notes FROM wishlist').all();
  const lastRefresh = db.prepare("SELECT value FROM app_config WHERE key = 'last_refresh'").get()?.value ?? null;

  res.json({ generatedAt: new Date().toISOString(), lastRefresh, series, volumes, owned, wishlist });
}
```

- [ ] **Step 4: Registrar la ruta en `backend/src/routes/user.routes.js`**

Justo después de `router.get('/series', ...)`:

```js
router.get('/snapshot', asyncHandler(ctrl.getSnapshot));
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `cd backend && npm test`
Expected: PASS — 6 tests de `snapshot.test.js`, más los 73 que ya existían.

- [ ] **Step 6: Comprobar el tamaño real contra la base de producción**

Run:
```bash
cd /home/juan/Documentos/Desarrollo/listadomanga && docker compose up -d --build backend && sleep 6 && curl -s localhost:4001/api/user/snapshot | wc -c
```
Expected: entre 600.000 y 900.000 bytes. Si se dispara por encima de 2 MB hay que revisar qué campo se ha colado.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/user.controller.js backend/src/routes/user.routes.js backend/test/snapshot.test.js
git commit -m "feat(offline): endpoint de snapshot de la colección"
```

---

### Task 2: Almacenamiento local

**Files:**
- Create: `frontend/src/lib/storage.js`
- Create: `frontend/test/storage.test.js`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `SNAPSHOT_KEY: 'lm.snapshot'`, `OUTBOX_KEY: 'lm.outbox'`
  - `isValidSnapshot(value): boolean`
  - `readSnapshot(store): object|null`, `writeSnapshot(snapshot, store): boolean`
  - `readOutbox(store): array`, `writeOutbox(ops, store): boolean`
  - Todas aceptan un `store` con la interfaz de `localStorage`; por defecto `globalThis.localStorage`.

- [ ] **Step 1: Añadir el script de test a `frontend/package.json`**

En `"scripts"`:

```json
    "test": "node --test test/*.test.js",
```

- [ ] **Step 2: Escribir el test que falla `frontend/test/storage.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAPSHOT_KEY, OUTBOX_KEY, isValidSnapshot,
  readSnapshot, writeSnapshot, readOutbox, writeOutbox
} from '../src/lib/storage.js';

// localStorage no existe en Node: los tests inyectan este doble.
function memoryStore(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
}

const SNAP = { generatedAt: '2026-08-11T18:00:00.000Z', series: [], volumes: [], owned: [], wishlist: [] };

test('guardar y recuperar el snapshot conserva los datos', () => {
  const store = memoryStore();
  assert.equal(writeSnapshot(SNAP, store), true);
  assert.deepEqual(readSnapshot(store), SNAP);
});

test('sin nada guardado devuelve null', () => {
  assert.equal(readSnapshot(memoryStore()), null);
});

test('un JSON corrupto se descarta en vez de reventar', () => {
  const store = memoryStore({ [SNAPSHOT_KEY]: '{"series": [1,2' });
  assert.equal(readSnapshot(store), null);
});

test('un snapshot incompleto se rechaza', () => {
  const store = memoryStore({ [SNAPSHOT_KEY]: JSON.stringify({ series: [] }) });
  assert.equal(readSnapshot(store), null);
  assert.equal(isValidSnapshot({ series: [], volumes: [], owned: [] }), false);
  assert.equal(isValidSnapshot(SNAP), true);
});

test('si el almacenamiento está lleno, escribir devuelve false sin lanzar', () => {
  const store = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(writeSnapshot(SNAP, store), false);
});

test('la cola vacía es un array, no null', () => {
  assert.deepEqual(readOutbox(memoryStore()), []);
});

test('la cola se guarda y se recupera en orden', () => {
  const store = memoryStore();
  const ops = [{ id: 'a' }, { id: 'b' }];
  writeOutbox(ops, store);
  assert.deepEqual(readOutbox(store), ops);
  assert.equal(store.getItem(OUTBOX_KEY).startsWith('['), true);
});

test('una cola corrupta se trata como vacía', () => {
  assert.deepEqual(readOutbox(memoryStore({ [OUTBOX_KEY]: 'no soy json' })), []);
});
```

- [ ] **Step 3: Ejecutar los tests y verificar que fallan**

Run: `cd frontend && npm test`
Expected: FAIL — `Cannot find module .../src/lib/storage.js`.

- [ ] **Step 4: Crear `frontend/src/lib/storage.js`**

```js
export const SNAPSHOT_KEY = 'lm.snapshot';
export const OUTBOX_KEY = 'lm.outbox';

function defaultStore() {
  return typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
}

function readJson(key, fallback, store) {
  try {
    const raw = (store ?? defaultStore())?.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    // JSON a medias o almacenamiento inaccesible: se empieza de cero en vez de
    // impedir que la app arranque.
    return fallback;
  }
}

function writeJson(key, value, store) {
  try {
    (store ?? defaultStore())?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Cuota llena o modo privado: no es motivo para romper la app.
    return false;
  }
}

// Un snapshot sirve solo si trae las cuatro colecciones. Uno a medias haría
// que las pantallas fallasen de formas raras más adelante.
export function isValidSnapshot(value) {
  return Boolean(
    value &&
    Array.isArray(value.series) &&
    Array.isArray(value.volumes) &&
    Array.isArray(value.owned) &&
    Array.isArray(value.wishlist)
  );
}

export function readSnapshot(store) {
  const snap = readJson(SNAPSHOT_KEY, null, store);
  return isValidSnapshot(snap) ? snap : null;
}

export function writeSnapshot(snapshot, store) {
  return writeJson(SNAPSHOT_KEY, snapshot, store);
}

export function readOutbox(store) {
  const ops = readJson(OUTBOX_KEY, [], store);
  return Array.isArray(ops) ? ops : [];
}

export function writeOutbox(ops, store) {
  return writeJson(OUTBOX_KEY, ops, store);
}
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `cd frontend && npm test`
Expected: PASS — 8 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/storage.js frontend/test/storage.test.js frontend/package.json
git commit -m "feat(offline): almacenamiento local tolerante a fallos"
```

---

### Task 3: Derivaciones del snapshot

**Files:**
- Create: `frontend/src/lib/collection.js`
- Create: `frontend/test/collection.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `indexSnapshot(snapshot)` → `{ seriesById, volumesBySeries, ownedKeys, ownedCount, coverBySeries }`
  - `pendingVolumes(snapshot, idx?)`, `upcomingVolumes(snapshot, idx?)`, `recentVolumes(snapshot, limit?, idx?)`
  - `mySeries(snapshot, idx?)`, `seriesDetail(snapshot, seriesId, idx?)`
  - `wishlistSeries(snapshot, idx?)`, `homeStats(snapshot, idx?)`
  - `searchSeries(series, query)`

- [ ] **Step 1: Escribir el test que falla `frontend/test/collection.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pendingVolumes, upcomingVolumes, recentVolumes, mySeries,
  seriesDetail, wishlistSeries, homeStats, searchSeries
} from '../src/lib/collection.js';

function snapshot(extra = {}) {
  return {
    generatedAt: '2026-08-11T18:00:00.000Z',
    lastRefresh: '2026-08-11 07:04:12',
    series: [
      { id: 1, name: 'Berserk', original_name: 'Beruseruku', editorial_es: 'Panini', total_volumes: 3, is_complete: 0, status: 'following' },
      { id: 2, name: 'Shōnan Junai Gumi', original_name: null, editorial_es: 'Ivrea', total_volumes: 2, is_complete: 1, status: 'following' },
      { id: 3, name: 'Descartada', original_name: null, editorial_es: 'Norma', total_volumes: 1, is_complete: 0, status: 'discarded' },
      { id: 4, name: 'Solo Deseada', original_name: null, editorial_es: 'Milky', total_volumes: 1, is_complete: 0, status: null }
    ],
    volumes: [
      { series_id: 1, number: 1, price: 9.5, release_date: 'Enero 2026', is_released: 1, cover_url: 'https://x/b1.jpg' },
      { series_id: 1, number: 2, price: 9.5, release_date: 'Marzo 2026', is_released: 1, cover_url: 'https://x/b2.jpg' },
      { series_id: 1, number: 3, price: 9.5, release_date: 'Diciembre 2026', is_released: 0, cover_url: 'https://x/b3.jpg' },
      { series_id: 2, number: 1, price: 8, release_date: 'Febrero 2026', is_released: 1, cover_url: 'https://x/s1.jpg' },
      { series_id: 2, number: 2, price: 8, release_date: 'Abril 2026', is_released: 1, cover_url: 'https://x/s2.jpg' },
      { series_id: 3, number: 1, price: 7, release_date: 'Enero 2026', is_released: 1, cover_url: 'https://x/d1.jpg' },
      { series_id: 4, number: 1, price: 7, release_date: 'Enero 2026', is_released: 1, cover_url: 'https://x/w1.jpg' }
    ],
    owned: [
      { series_id: 1, volume_number: 1, purchased_at: '2026-01-15 10:00:00' },
      { series_id: 2, volume_number: 1, purchased_at: '2026-03-20 10:00:00' },
      { series_id: 2, volume_number: 2, purchased_at: '2026-04-25 10:00:00' }
    ],
    wishlist: [{ series_id: 4, notes: 'me interesa' }],
    ...extra
  };
}

test('los pendientes son los publicados sin comprar de series seguidas', () => {
  const p = pendingVolumes(snapshot());
  assert.deepEqual(p.map(v => `${v.series_id}:${v.number}`), ['1:2']);
  assert.equal(p[0].series_name, 'Berserk');
  assert.equal(p[0].series_cover, 'https://x/b1.jpg');
});

test('los pendientes no incluyen descartadas ni las de solo wishlist', () => {
  const ids = pendingVolumes(snapshot()).map(v => v.series_id);
  assert.ok(!ids.includes(3));
  assert.ok(!ids.includes(4));
});

test('los pendientes se ordenan por fecha descendente', () => {
  const snap = snapshot();
  snap.owned = [];
  const p = pendingVolumes(snap);
  assert.deepEqual(p.map(v => v.release_date), ['Abril 2026', 'Marzo 2026', 'Febrero 2026', 'Enero 2026']);
});

test('los próximos son los no publicados con fecha, ascendente', () => {
  const u = upcomingVolumes(snapshot());
  assert.equal(u.length, 1);
  assert.equal(u[0].number, 3);
  assert.equal(u[0].series_name, 'Berserk');
});

test('los recientes van por fecha de compra descendente y con tope', () => {
  const r = recentVolumes(snapshot());
  assert.deepEqual(r.map(v => v.purchased_at), ['2026-04-25 10:00:00', '2026-03-20 10:00:00', '2026-01-15 10:00:00']);
  assert.equal(r[0].series_name, 'Shōnan Junai Gumi');
  assert.equal(recentVolumes(snapshot(), 2).length, 2);
});

test('mis series traen progreso, comprados y portada del tomo 1', () => {
  const s = mySeries(snapshot()).find(x => x.id === 1);
  assert.equal(s.owned_volumes, 1);
  assert.equal(s.total_volumes, 3);
  assert.equal(s.progress, 33.3);
  assert.equal(s.cover_url, 'https://x/b1.jpg');
});

test('el progreso es 0 si no se conoce el total', () => {
  const snap = snapshot();
  snap.series[0].total_volumes = 0;
  assert.equal(mySeries(snap).find(s => s.id === 1).progress, 0);
});

test('la ficha marca qué tomos se tienen, ordenados por número', () => {
  const d = seriesDetail(snapshot(), 1);
  assert.deepEqual(d.volumes.map(v => [v.number, v.owned]), [[1, 1], [2, 0], [3, 0]]);
  assert.equal(d.name, 'Berserk');
});

test('la ficha de una serie inexistente es null y una sin tomos no rompe', () => {
  assert.equal(seriesDetail(snapshot(), 999), null);
  const snap = snapshot();
  snap.volumes = [];
  assert.deepEqual(seriesDetail(snap, 1).volumes, []);
});

test('el buscador ignora mayúsculas y acentos', () => {
  const lista = mySeries(snapshot());
  assert.deepEqual(searchSeries(lista, 'shonan').map(s => s.id), [2]);
  assert.deepEqual(searchSeries(lista, 'BERSERK').map(s => s.id), [1]);
  assert.equal(searchSeries(lista, '').length, lista.length);
});

test('el buscador también mira el título original', () => {
  assert.deepEqual(searchSeries(mySeries(snapshot()), 'beruseruku').map(s => s.id), [1]);
});

test('la wishlist resuelve las series aunque no se sigan', () => {
  const w = wishlistSeries(snapshot());
  assert.equal(w.length, 1);
  assert.equal(w[0].id, 4);
  assert.equal(w[0].notes, 'me interesa');
  assert.equal(w[0].cover_url, 'https://x/w1.jpg');
});

test('los contadores de la home cuadran', () => {
  const st = homeStats(snapshot());
  assert.equal(st.totalSeries, 3);      // following + discarded, no la de solo wishlist
  assert.equal(st.totalVolumes, 3);     // tomos comprados
  assert.equal(st.wishlistCount, 1);
  assert.equal(st.completedSeries, 1);  // Shōnan: completa y con sus 2 tomos
  assert.equal(st.lastRefresh, '2026-08-11 07:04:12');
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `cd frontend && npm test`
Expected: FAIL — `Cannot find module .../src/lib/collection.js`.

- [ ] **Step 3: Crear `frontend/src/lib/collection.js`**

```js
// Los meses vienen en español dentro de release_date ('Septiembre 2025'). El
// backend ordena convirtiéndolos a 'AAAA-MM'; aquí se replica al pie de la
// letra para que el orden de las listas no cambie al pasar a offline.
const MESES = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
};

const CLAVE_PENDIENTE = { mes: '00', ano: '0000' };
const CLAVE_PROXIMO = { mes: '12', ano: '9999' };

function claveFecha(dateStr, { mes, ano }) {
  if (!dateStr) return `${ano}-${mes}`;
  const partes = String(dateStr).toLowerCase().split(' ');
  if (partes.length !== 2) return `${ano}-${mes}`;
  return `${partes[1] || ano}-${MESES[partes[0]] || mes}`;
}

const sinAcentos = (texto) =>
  String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function indexSnapshot(snapshot) {
  const seriesById = new Map(snapshot.series.map((s) => [s.id, s]));

  const volumesBySeries = new Map();
  for (const v of snapshot.volumes) {
    if (!volumesBySeries.has(v.series_id)) volumesBySeries.set(v.series_id, []);
    volumesBySeries.get(v.series_id).push(v);
  }

  const ownedKeys = new Set();
  const ownedCount = new Map();
  for (const o of snapshot.owned) {
    ownedKeys.add(`${o.series_id}:${o.volume_number}`);
    ownedCount.set(o.series_id, (ownedCount.get(o.series_id) || 0) + 1);
  }

  // La portada de una serie es la de su tomo 1, igual que en el backend.
  const coverBySeries = new Map();
  for (const [id, vols] of volumesBySeries) {
    coverBySeries.set(id, vols.find((v) => v.number === 1)?.cover_url ?? null);
  }

  return { seriesById, volumesBySeries, ownedKeys, ownedCount, coverBySeries };
}

function conContexto(v, serie, idx) {
  return {
    ...v,
    series_id: serie.id,
    series_name: serie.name,
    editorial_es: serie.editorial_es,
    series_cover: idx.coverBySeries.get(serie.id) ?? null
  };
}

export function pendingVolumes(snapshot, idx = indexSnapshot(snapshot)) {
  const out = [];
  for (const serie of snapshot.series) {
    if (serie.status !== 'following') continue;
    for (const v of idx.volumesBySeries.get(serie.id) ?? []) {
      if (v.is_released !== 1) continue;
      if (idx.ownedKeys.has(`${serie.id}:${v.number}`)) continue;
      out.push(conContexto(v, serie, idx));
    }
  }

  out.sort((a, b) => {
    const c = claveFecha(b.release_date, CLAVE_PENDIENTE).localeCompare(claveFecha(a.release_date, CLAVE_PENDIENTE));
    if (c !== 0) return c;
    return a.series_name.localeCompare(b.series_name, 'es') || a.number - b.number;
  });

  return out;
}

export function upcomingVolumes(snapshot, idx = indexSnapshot(snapshot)) {
  const out = [];
  for (const serie of snapshot.series) {
    if (serie.status !== 'following') continue;
    for (const v of idx.volumesBySeries.get(serie.id) ?? []) {
      if (v.is_released !== 0 || !v.release_date) continue;
      out.push(conContexto(v, serie, idx));
    }
  }

  out.sort((a, b) =>
    claveFecha(a.release_date, CLAVE_PROXIMO).localeCompare(claveFecha(b.release_date, CLAVE_PROXIMO))
  );

  return out;
}

export function recentVolumes(snapshot, limit = 50, idx = indexSnapshot(snapshot)) {
  return [...snapshot.owned]
    .sort((a, b) => String(b.purchased_at ?? '').localeCompare(String(a.purchased_at ?? '')))
    .slice(0, limit)
    .map((o) => {
      const serie = idx.seriesById.get(o.series_id);
      if (!serie) return null;
      const v = (idx.volumesBySeries.get(o.series_id) ?? []).find((x) => x.number === o.volume_number);
      return {
        ...conContexto(v ?? { number: o.volume_number }, serie, idx),
        number: o.volume_number,
        purchased_at: o.purchased_at ?? null
      };
    })
    .filter(Boolean);
}

export function mySeries(snapshot, idx = indexSnapshot(snapshot)) {
  return snapshot.series
    .map((s) => {
      const owned_volumes = idx.ownedCount.get(s.id) ?? 0;
      const total = s.total_volumes ?? 0;
      return {
        ...s,
        owned_volumes,
        cover_url: idx.coverBySeries.get(s.id) ?? null,
        // Misma fórmula que el SQL: un decimal, y 0 si no hay total conocido.
        progress: total > 0 ? Math.round(((owned_volumes * 100) / total) * 10) / 10 : 0
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function seriesDetail(snapshot, seriesId, idx = indexSnapshot(snapshot)) {
  const serie = idx.seriesById.get(Number(seriesId));
  if (!serie) return null;

  const volumes = (idx.volumesBySeries.get(serie.id) ?? [])
    .map((v) => ({ ...v, owned: idx.ownedKeys.has(`${serie.id}:${v.number}`) ? 1 : 0 }))
    .sort((a, b) => a.number - b.number);

  return { ...serie, cover_url: idx.coverBySeries.get(serie.id) ?? null, volumes };
}

export function wishlistSeries(snapshot, idx = indexSnapshot(snapshot)) {
  return snapshot.wishlist
    .map((w) => {
      const serie = idx.seriesById.get(w.series_id);
      if (!serie) return null;
      return { ...serie, notes: w.notes ?? null, cover_url: idx.coverBySeries.get(serie.id) ?? null };
    })
    .filter(Boolean);
}

export function homeStats(snapshot, idx = indexSnapshot(snapshot)) {
  const delUsuario = snapshot.series.filter((s) => s.status !== null && s.status !== undefined);

  return {
    totalSeries: delUsuario.length,
    totalVolumes: snapshot.owned.length,
    wishlistCount: snapshot.wishlist.length,
    completedSeries: delUsuario.filter(
      (s) => s.is_complete === 1 && s.total_volumes != null && (idx.ownedCount.get(s.id) ?? 0) === s.total_volumes
    ).length,
    lastRefresh: snapshot.lastRefresh ?? null
  };
}

export function searchSeries(series, query) {
  const q = sinAcentos(query).trim();
  if (!q) return series;
  return series.filter((s) => sinAcentos(s.name).includes(q) || sinAcentos(s.original_name).includes(q));
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `cd frontend && npm test`
Expected: PASS — 13 tests de `collection.test.js`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/collection.js frontend/test/collection.test.js
git commit -m "feat(offline): derivaciones del snapshot con paridad de backend"
```

---

### Task 4: Cola de escrituras

**Files:**
- Create: `frontend/src/lib/outbox.js`
- Create: `frontend/test/outbox.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `crearOp(tipo, seriesId, volumeNumber, ts)` → `{ id, tipo, seriesId, volumeNumber, ts }` con `tipo` en `'comprar' | 'descomprar'`
  - `aplicarOp(snapshot, op)` → nuevo snapshot con `owned` actualizado
  - `encolar(outbox, op)` → nueva cola
  - `replay(outbox, acciones)` → `Promise<{ enviadas, restantes }>`; `acciones` es `{ comprar(seriesId, n), descomprar(seriesId, n) }`

- [ ] **Step 1: Escribir el test que falla `frontend/test/outbox.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearOp, aplicarOp, encolar, replay } from '../src/lib/outbox.js';

function snap() {
  return {
    series: [{ id: 1, name: 'Berserk', status: 'following', total_volumes: 3 }],
    volumes: [{ series_id: 1, number: 1, is_released: 1 }, { series_id: 1, number: 2, is_released: 1 }],
    owned: [{ series_id: 1, volume_number: 1, purchased_at: '2026-01-01 10:00:00' }],
    wishlist: []
  };
}

test('comprar añade el tomo a los comprados al momento', () => {
  const s = aplicarOp(snap(), crearOp('comprar', 1, 2, '2026-08-11T18:00:00.000Z'));
  assert.equal(s.owned.length, 2);
  assert.ok(s.owned.some(o => o.series_id === 1 && o.volume_number === 2));
});

test('descomprar lo quita', () => {
  const s = aplicarOp(snap(), crearOp('descomprar', 1, 1, '2026-08-11T18:00:00.000Z'));
  assert.deepEqual(s.owned, []);
});

test('comprar dos veces el mismo tomo no lo duplica', () => {
  let s = snap();
  s = aplicarOp(s, crearOp('comprar', 1, 2, 't1'));
  s = aplicarOp(s, crearOp('comprar', 1, 2, 't2'));
  assert.equal(s.owned.filter(o => o.volume_number === 2).length, 1);
});

test('aplicar no muta el snapshot original', () => {
  const original = snap();
  aplicarOp(original, crearOp('comprar', 1, 2, 't'));
  assert.equal(original.owned.length, 1);
});

test('encolar conserva el orden', () => {
  const cola = encolar(encolar([], crearOp('comprar', 1, 2, 't1')), crearOp('descomprar', 1, 1, 't2'));
  assert.deepEqual(cola.map(o => o.tipo), ['comprar', 'descomprar']);
});

test('cada operación lleva un id distinto', () => {
  const a = crearOp('comprar', 1, 2, 't');
  const b = crearOp('comprar', 1, 2, 't');
  assert.notEqual(a.id, b.id);
});

test('replay envía en orden y vacía la cola', async () => {
  const hechas = [];
  const acciones = {
    comprar: async (s, n) => hechas.push(`c${s}:${n}`),
    descomprar: async (s, n) => hechas.push(`d${s}:${n}`)
  };
  const cola = [crearOp('comprar', 1, 2, 't1'), crearOp('descomprar', 1, 1, 't2')];

  const r = await replay(cola, acciones);

  assert.deepEqual(hechas, ['c1:2', 'd1:1']);
  assert.equal(r.enviadas, 2);
  assert.deepEqual(r.restantes, []);
});

test('si una operación falla, se detiene y conserva esa y las siguientes', async () => {
  const hechas = [];
  const acciones = {
    comprar: async (s, n) => { if (n === 3) throw new Error('sin red'); hechas.push(`c${n}`); },
    descomprar: async () => hechas.push('d')
  };
  const cola = [crearOp('comprar', 1, 2, 't1'), crearOp('comprar', 1, 3, 't2'), crearOp('descomprar', 1, 1, 't3')];

  const r = await replay(cola, acciones);

  assert.deepEqual(hechas, ['c2']);
  assert.equal(r.enviadas, 1);
  assert.deepEqual(r.restantes.map(o => o.volumeNumber), [3, 1]);
});

test('una cola vacía no llama a nada', async () => {
  let llamado = false;
  const r = await replay([], { comprar: async () => { llamado = true; }, descomprar: async () => {} });
  assert.equal(llamado, false);
  assert.equal(r.enviadas, 0);
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `cd frontend && npm test`
Expected: FAIL — `Cannot find module .../src/lib/outbox.js`.

- [ ] **Step 3: Crear `frontend/src/lib/outbox.js`**

```js
let contador = 0;

export function crearOp(tipo, seriesId, volumeNumber, ts) {
  contador += 1;
  return { id: `${ts}-${contador}`, tipo, seriesId, volumeNumber, ts };
}

// Devuelve un snapshot nuevo: las vistas son reactivas y mutar el original
// dejaría estados a medias si algo falla después.
export function aplicarOp(snapshot, op) {
  const resto = snapshot.owned.filter(
    (o) => !(o.series_id === op.seriesId && o.volume_number === op.volumeNumber)
  );

  const owned =
    op.tipo === 'comprar'
      ? [...resto, { series_id: op.seriesId, volume_number: op.volumeNumber, purchased_at: op.ts }]
      : resto;

  return { ...snapshot, owned };
}

export function encolar(outbox, op) {
  return [...outbox, op];
}

// Reproduce la cola en orden. Al primer fallo se detiene: si no hay red, las
// siguientes tampoco van a salir, y así se conserva el orden original.
export async function replay(outbox, acciones) {
  let enviadas = 0;

  for (const op of outbox) {
    try {
      if (op.tipo === 'comprar') await acciones.comprar(op.seriesId, op.volumeNumber);
      else await acciones.descomprar(op.seriesId, op.volumeNumber);
      enviadas += 1;
    } catch {
      return { enviadas, restantes: outbox.slice(enviadas) };
    }
  }

  return { enviadas, restantes: [] };
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `cd frontend && npm test`
Expected: PASS — 9 tests de `outbox.test.js`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/outbox.js frontend/test/outbox.test.js
git commit -m "feat(offline): cola de escrituras pendientes"
```

---

### Task 5: Store y sincronización

**Files:**
- Create: `frontend/src/services/sync.js`
- Create: `frontend/src/stores/collection.js`
- Modify: `frontend/src/main.js`

**Interfaces:**
- Consumes: `readSnapshot`, `writeSnapshot`, `readOutbox`, `writeOutbox` (Task 2); todas las derivaciones (Task 3); `crearOp`, `aplicarOp`, `encolar`, `replay` (Task 4); `markVolumePurchased`, `unmarkVolumePurchased` de `services/api.js`.
- Produces:
  - `fetchSnapshot({ timeoutMs, fetchImpl })` → `Promise<snapshot>`
  - `precargarPortadas(urls)` → `Promise<void>`
  - `useCollectionStore()` con estado `snapshot`, `outbox`, `syncing`, `lastSyncAt`, `online`; getters `hasData`, `pending`, `upcoming`, `recent`, `series`, `wishlist`, `stats`, `detail(id)`; acciones `hydrate()`, `sync()`, `marcarComprado(seriesId, n)`, `desmarcarComprado(seriesId, n)`

- [ ] **Step 1: Crear `frontend/src/services/sync.js`**

```js
// Timeout corto a propósito: con la VPN apagada la petición al NAS puede
// quedarse colgada, y la app no debe esperarla nunca.
const TIMEOUT_MS = 2000;

export async function fetchSnapshot({ timeoutMs = TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const ctrl = new AbortController();
  const temporizador = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetchImpl('/api/user/snapshot', { signal: ctrl.signal });
    if (!res.ok) throw new Error(`snapshot ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(temporizador);
  }
}

// Pide al navegador que se traiga las portadas de los pendientes para que el
// service worker las guarde. Silencioso: si falla, no pasa nada.
export async function precargarPortadas(urls) {
  await Promise.allSettled(
    urls.filter(Boolean).map((url) => fetch(url, { mode: 'no-cors', cache: 'force-cache' }))
  );
}
```

- [ ] **Step 2: Crear `frontend/src/stores/collection.js`**

```js
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { readSnapshot, writeSnapshot, readOutbox, writeOutbox } from '../lib/storage.js';
import { crearOp, aplicarOp, encolar, replay } from '../lib/outbox.js';
import * as C from '../lib/collection.js';
import { fetchSnapshot, precargarPortadas } from '../services/sync.js';
import { markVolumePurchased, unmarkVolumePurchased } from '../services/api.js';

export const useCollectionStore = defineStore('collection', () => {
  const snapshot = ref(null);
  const outbox = ref([]);
  const syncing = ref(false);
  const lastSyncAt = ref(null);
  const online = ref(true);

  const index = computed(() => (snapshot.value ? C.indexSnapshot(snapshot.value) : null));
  const hasData = computed(() => snapshot.value !== null);

  const pending = computed(() => (snapshot.value ? C.pendingVolumes(snapshot.value, index.value) : []));
  const upcoming = computed(() => (snapshot.value ? C.upcomingVolumes(snapshot.value, index.value) : []));
  const recent = computed(() => (snapshot.value ? C.recentVolumes(snapshot.value, 50, index.value) : []));
  const series = computed(() => (snapshot.value ? C.mySeries(snapshot.value, index.value) : []));
  const wishlist = computed(() => (snapshot.value ? C.wishlistSeries(snapshot.value, index.value) : []));
  const stats = computed(() => (snapshot.value ? C.homeStats(snapshot.value, index.value) : null));

  const detail = (id) => (snapshot.value ? C.seriesDetail(snapshot.value, id, index.value) : null);

  // Lectura síncrona: se llama antes de montar la app para que la primera
  // pintura ya lleve datos.
  function hydrate() {
    snapshot.value = readSnapshot();
    outbox.value = readOutbox();
    lastSyncAt.value = snapshot.value?.generatedAt ?? null;
  }

  function persistir() {
    if (snapshot.value) writeSnapshot(snapshot.value);
    writeOutbox(outbox.value);
  }

  function aplicarLocal(tipo, seriesId, volumeNumber) {
    if (!snapshot.value) return;
    const op = crearOp(tipo, seriesId, volumeNumber, new Date().toISOString());
    snapshot.value = aplicarOp(snapshot.value, op);
    outbox.value = encolar(outbox.value, op);
    persistir();
  }

  const marcarComprado = (seriesId, n) => aplicarLocal('comprar', seriesId, n);
  const desmarcarComprado = (seriesId, n) => aplicarLocal('descomprar', seriesId, n);

  async function sync() {
    if (syncing.value) return;
    syncing.value = true;

    try {
      // El orden importa. Primero una petición con timeout de 2 s que hace de
      // sonda: si el NAS no está, se corta aquí y no se llega a tocar la cola,
      // que va por axios con timeout de 120 s y dejaría la sincronización
      // colgada dos minutos.
      let fresco = await fetchSnapshot();
      online.value = true;

      // Y solo entonces se vacía la cola, volviendo a pedir el snapshot
      // después: el primero es anterior a los cambios enviados y usarlo
      // desharía visualmente lo que marcaste sin conexión.
      if (outbox.value.length > 0) {
        const r = await replay(outbox.value, {
          comprar: (s, n) => markVolumePurchased(s, n),
          descomprar: (s, n) => unmarkVolumePurchased(s, n)
        });
        outbox.value = r.restantes;
        writeOutbox(outbox.value);

        if (r.enviadas > 0) fresco = await fetchSnapshot();
      }

      // Lo que siga en la cola (un envío que falló a medias) no está en el
      // snapshot del servidor: se reaplica encima para que esas marcas no se
      // vean desaparecer de golpe.
      let base = fresco;
      for (const op of outbox.value) base = aplicarOp(base, op);

      snapshot.value = base;
      lastSyncAt.value = fresco.generatedAt;
      writeSnapshot(base);

      precargarPortadas(pending.value.slice(0, 60).map((v) => v.cover_url || v.series_cover));
    } catch {
      // Sin conexión o NAS inalcanzable: se sigue con lo local, sin ruido.
      online.value = false;
    } finally {
      syncing.value = false;
    }
  }

  return {
    snapshot, outbox, syncing, lastSyncAt, online,
    hasData, pending, upcoming, recent, series, wishlist, stats, detail,
    hydrate, sync, marcarComprado, desmarcarComprado
  };
});
```

- [ ] **Step 3: Hidratar antes de montar en `frontend/src/main.js`**

Sustituir el bloque de creación de la app por:

```js
const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

// Hidratar ANTES de montar: leer y parsear el snapshot de localStorage cuesta
// milisegundos, así que la primera pintura ya sale con datos y nunca se espera
// a la red.
const collection = useCollectionStore(pinia);
collection.hydrate();

app.mount('#app');

// Y sincronizar en segundo plano, sin bloquear nada.
collection.sync();
```

Añadir el import correspondiente arriba:

```js
import { useCollectionStore } from './stores/collection.js';
```

- [ ] **Step 4: Verificar que la suite sigue en verde y que la app compila**

Run: `cd frontend && npm test && npm run build`
Expected: 30 tests en verde y el build de Vite termina sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/sync.js frontend/src/stores/collection.js frontend/src/main.js
git commit -m "feat(offline): store de colección e hidratación al arrancar"
```

---

### Task 6: Home y Mis Series desde el store

**Files:**
- Modify: `frontend/src/views/HomeView.vue`
- Modify: `frontend/src/views/MySeriesView.vue`

**Interfaces:**
- Consumes: `useCollectionStore` (Task 5); `searchSeries` (Task 3).
- Produces: nada nuevo.

- [ ] **Step 1: Reescribir el script de `HomeView.vue` para leer del store**

Sustituir los imports del API y el estado local por el store. Los `ref` `pending`, `upcoming`, `recent` y la función `load()` desaparecen; `stats` pasa a salir del store:

```js
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useCollectionStore } from '../stores/collection.js';
import { useConfirm } from '../composables/useConfirm.js';
import Tabs from '../components/Tabs.vue';
import PendingVolumeCard from '../components/PendingVolumeCard.vue';
import RecentVolumeCard from '../components/RecentVolumeCard.vue';
import EmptyState from '../components/EmptyState.vue';

const collection = useCollectionStore();
const { confirm } = useConfirm();

const activeTab = ref('pending');

const pending = computed(() => collection.pending);
const upcoming = computed(() => collection.upcoming);
const recent = computed(() => collection.recent);

const lastRefreshLabel = computed(() => {
  const lr = collection.stats?.lastRefresh;
  if (!lr) return null;
  // SQLite guarda en UTC sin zona: añadir 'Z' para hora local correcta.
  return new Date(lr.replace(' ', 'T') + 'Z').toLocaleString('es-ES');
});

const tabs = computed(() => [
  { key: 'pending', label: 'Tomos pendientes', count: pending.value.length },
  { key: 'upcoming', label: 'Próximos lanzamientos', count: upcoming.value.length },
  { key: 'recent', label: 'Últimos añadidos', count: recent.value.length }
]);

const statCards = computed(() => [
  { label: 'Series', value: collection.stats?.totalSeries ?? 0 },
  { label: 'Tomos', value: collection.stats?.totalVolumes ?? 0 },
  { label: 'Completas', value: collection.stats?.completedSeries ?? 0 },
  { label: 'En Wishlist', value: collection.stats?.wishlistCount ?? 0 }
]);

async function handleBuy(vol) {
  const ok = await confirm({
    title: 'Marcar como comprado',
    message: `¿Marcar el tomo ${vol.number} de «${vol.series_name}» como comprado?`,
    confirmText: 'Sí, comprado'
  });
  if (!ok) return;
  collection.marcarComprado(vol.series_id, vol.number);
}
```

En la plantilla, el bloque de carga se sustituye por el de "sin datos todavía",
y el bloque de `error` se elimina entero porque ya no hay ninguna petición que
pueda fallar:

```vue
<EmptyState
  v-if="!collection.hasData"
  title="Sin datos descargados todavía"
  message="Conéctate a la VPN o a la wifi de casa y toca el chip de sincronizar."
/>
```

También hay que quitar el `onMounted(load)` del final del script: ya no hay nada
que cargar.

- [ ] **Step 2: Reescribir el script de `MySeriesView.vue`**

`allSeries` y `load()` se sustituyen por el store, y el filtro pasa a usar `searchSeries` para que ignore acentos:

```js
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useCollectionStore } from '../stores/collection.js';
import { searchSeries } from '../lib/collection.js';
import { refreshAllSeries, refollowSeries } from '../services/api.js';
import { useConfirm } from '../composables/useConfirm.js';
import SeriesCard from '../components/SeriesCard.vue';
import Tabs from '../components/Tabs.vue';
import EmptyState from '../components/EmptyState.vue';

const collection = useCollectionStore();
const { confirm } = useConfirm();

const filter = ref('in-progress');
const search = ref('');
const refreshing = ref(false);
const info = ref(null);

// Solo las del usuario: las que están únicamente en la wishlist llegan con
// status nulo y no pintan aquí.
const allSeries = computed(() => collection.series.filter((s) => s.status));

const counts = computed(() => ({
  'in-progress': allSeries.value.filter((s) => s.status === 'following' && s.progress < 100).length,
  all: allSeries.value.filter((s) => s.status === 'following').length,
  discarded: allSeries.value.filter((s) => s.status === 'discarded').length
}));

const filteredSeries = computed(() => {
  if (search.value.trim()) return searchSeries(allSeries.value, search.value);
  return allSeries.value.filter((s) => {
    if (filter.value === 'in-progress') return s.status === 'following' && s.progress < 100;
    if (filter.value === 'all') return s.status === 'following';
    if (filter.value === 'discarded') return s.status === 'discarded';
    return true;
  });
});
```

`handleRefreshAll` y el re-seguir siguen llamando al API, pero al terminar piden `collection.sync()` en vez de `load()`.

- [ ] **Step 3: Comprobar en el navegador con el backend levantado**

Run: `cd /home/juan/Documentos/Desarrollo/listadomanga && docker compose up -d --build && sleep 8 && curl -s -o /dev/null -w "%{http_code}\n" localhost:4000`
Expected: `200`. Abrir `http://localhost:4000`, comprobar que la home muestra pendientes, próximos y recientes con los mismos números que antes, y que en "Mis series" el buscador encuentra por nombre.

- [ ] **Step 4: Comprobar la paridad de los datos**

Run:
```bash
cd /home/juan/Documentos/Desarrollo/listadomanga && node -e "
const base = 'http://localhost:4001/api';
Promise.all([
  fetch(base + '/user/pending').then(r => r.json()),
  fetch(base + '/user/upcoming').then(r => r.json()),
  fetch(base + '/user/snapshot').then(r => r.json())
]).then(async ([pending, upcoming, snap]) => {
  const { pendingVolumes, upcomingVolumes } = await import('./frontend/src/lib/collection.js');
  const p = pendingVolumes(snap), u = upcomingVolumes(snap);
  console.log('pendientes API:', pending.length, '| local:', p.length);
  console.log('próximos  API:', upcoming.length, '| local:', u.length);
  console.log('mismo primer pendiente:', pending[0]?.series_name === p[0]?.series_name, pending[0]?.series_name, '/', p[0]?.series_name);
});"
```
Expected: los recuentos coinciden y el primer pendiente es el mismo. Si no, la derivación local no tiene paridad y hay que corregirla antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/HomeView.vue frontend/src/views/MySeriesView.vue
git commit -m "feat(offline): home y mis series leen del store local"
```

---

### Task 7: Ficha de serie, wishlist y pantallas con conexión

**Files:**
- Create: `frontend/src/components/NeedsConnection.vue`
- Modify: `frontend/src/views/SeriesDetailView.vue`
- Modify: `frontend/src/views/WishlistView.vue`
- Modify: `frontend/src/views/SearchView.vue`
- Modify: `frontend/src/views/StatsView.vue`

**Interfaces:**
- Consumes: `useCollectionStore` (Task 5).
- Produces: componente `NeedsConnection` con prop `accion: String`.

- [ ] **Step 1: Crear `frontend/src/components/NeedsConnection.vue`**

```vue
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
```

- [ ] **Step 2: Hacer que `SeriesDetailView.vue` lea del store**

La carga de la serie y sus tomos deja de llamar al API:

```js
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useCollectionStore } from '../stores/collection.js';

const route = useRoute();
const collection = useCollectionStore();

const series = computed(() => collection.detail(route.params.id));
```

Las llamadas a `getSeries`, `getSeriesVolumes` y `getUserSeries` desaparecen. Marcar y desmarcar tomos pasa por el store:

```js
function toggleVolume(vol) {
  if (vol.owned) collection.desmarcarComprado(series.value.id, vol.number);
  else collection.marcarComprado(series.value.id, vol.number);
}
```

Para el marcado en bloque (`markVolumesBulk`), se encola una operación por tomo:

```js
function marcarHasta(numero) {
  for (const v of series.value.volumes) {
    if (v.number <= numero && !v.owned) collection.marcarComprado(series.value.id, v.number);
  }
}
```

Los botones de seguir, descartar, refrescar y wishlist siguen llamando al API; cuando `collection.online` es `false` se sustituyen por `<NeedsConnection accion="cambiar el seguimiento de la serie" />`.

Si `series` es `null` (serie que no está en el snapshot), se muestra `<NeedsConnection accion="ver esta serie" />` en vez de un error.

- [ ] **Step 3: Hacer que `WishlistView.vue` lea del store**

```js
import { computed } from 'vue';
import { useCollectionStore } from '../stores/collection.js';

const collection = useCollectionStore();
const wishlist = computed(() => collection.wishlist);
```

Los botones de quitar de la wishlist y de seguir la serie se ocultan y se sustituyen por `<NeedsConnection accion="modificar la wishlist" />` cuando `collection.online` es `false`.

- [ ] **Step 4: Avisar en `SearchView.vue` y `StatsView.vue`**

En ambas, envolver el contenido con:

```vue
<NeedsConnection v-if="!collection.online" accion="buscar series nuevas" />
```

(en `StatsView.vue`, `accion="ver las estadísticas"`). Importan el store solo para leer `online`.

- [ ] **Step 5: Verificar en el navegador**

Run: `cd /home/juan/Documentos/Desarrollo/listadomanga && docker compose up -d --build frontend && sleep 5`
Abrir `http://localhost:4000`, entrar en una serie, comprobar que salen los tomos con los que tienes marcados, marcar uno y ver que cambia al instante. Comprobar la wishlist.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/NeedsConnection.vue frontend/src/views/
git commit -m "feat(offline): ficha, wishlist y avisos de conexión"
```

---

### Task 8: Service worker e instalación

**Files:**
- Modify: `frontend/public/sw.js`
- Modify: `frontend/public/manifest.json`
- Create: `frontend/public/icon-192.png`, `frontend/public/icon-512.png`

**Interfaces:**
- Consumes: nada.
- Produces: nada que consuma otra tarea.

- [ ] **Step 1: Generar los iconos**

Run:
```bash
cd /home/juan/Documentos/Desarrollo/listadomanga/frontend/public && \
  magick favicon.jpg -resize 192x192 icon-192.png && \
  magick favicon.jpg -resize 512x512 icon-512.png && \
  ls -la icon-*.png
```
Expected: dos PNG, de bastante menos de 100 KB cada uno.

- [ ] **Step 2: Corregir `frontend/public/manifest.json`**

Sustituir el bloque `icons` por:

```json
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
```

Los tamaños declarados ahora coinciden con los reales y se quita `maskable`, que recortaba el icono por no tener zona de seguridad.

- [ ] **Step 3: Reescribir `frontend/public/sw.js`**

```js
// Estrategia por tipo de recurso. La regla que lo gobierna todo: nunca hacer
// esperar a la app por la red.
const VERSION = 'v2';
const SHELL_CACHE = `lm-shell-${VERSION}`;
const ASSET_CACHE = `lm-assets-${VERSION}`;
const COVER_CACHE = 'lm-covers';

const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const vigentes = [SHELL_CACHE, ASSET_CACHE, COVER_CACHE];
  event.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => !vigentes.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const guardado = await cache.match(request);
  if (guardado) return guardado;

  const respuesta = await fetch(request);
  // Las respuestas opacas (portadas de otro dominio) también se guardan.
  if (respuesta && (respuesta.ok || respuesta.type === 'opaque')) {
    cache.put(request, respuesta.clone());
  }
  return respuesta;
}

async function navegacion(request) {
  try {
    const respuesta = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put('/index.html', respuesta.clone());
    return respuesta;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match('/index.html')) ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Los datos viven en localStorage. Interceptar /api solo servía para que la
  // app se quedase esperando a que la red fallase: que falle rápido y ya está.
  if (url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(navegacion(event.request));
    return;
  }

  if (url.hostname === 'static.listadomanga.com') {
    event.respondWith(cacheFirst(event.request, COVER_CACHE));
    return;
  }

  // Los bundles de Vite llevan hash en el nombre: son inmutables.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event.request, ASSET_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
  }
});
```

- [ ] **Step 4: Verificar que el service worker se registra y cachea**

Run: `cd /home/juan/Documentos/Desarrollo/listadomanga && docker compose up -d --build frontend && sleep 5`

Abrir `http://localhost:4000` en Chrome, en DevTools → Application → Service Workers comprobar que `sw.js` está activo con la versión nueva, y en Cache Storage que existen `lm-shell-v2`, `lm-assets-v2` y, tras navegar por unas series, `lm-covers`.

Después, en DevTools → Network marcar **Offline** y recargar: la app debe pintar con datos. En la pestaña Network, las peticiones a `/api/` deben fallar de inmediato, no quedarse pendientes.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/sw.js frontend/public/manifest.json frontend/public/icon-192.png frontend/public/icon-512.png
git commit -m "feat(offline): service worker por tipo de recurso e iconos reales"
```

---

### Task 9: Chip de estado y verificación en el móvil

**Files:**
- Create: `frontend/src/components/SyncChip.vue`
- Modify: `frontend/src/components/Navbar.vue`
- Modify: `README.md`

**Interfaces:**
- Consumes: `useCollectionStore` (Task 5).
- Produces: componente `SyncChip` sin props.

- [ ] **Step 1: Crear `frontend/src/components/SyncChip.vue`**

```vue
<script setup>
import { computed } from 'vue';
import { useCollectionStore } from '../stores/collection.js';

const collection = useCollectionStore();

function hace(iso) {
  if (!iso) return 'nunca';
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'ahora mismo';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} días`;
}

const texto = computed(() => {
  if (collection.syncing) return 'Sincronizando…';
  if (collection.outbox.length > 0) {
    return `${collection.outbox.length} cambio${collection.outbox.length > 1 ? 's' : ''} sin enviar`;
  }
  if (!collection.online) return `Sin conexión · datos de ${hace(collection.lastSyncAt)}`;
  return `Sincronizado ${hace(collection.lastSyncAt)}`;
});

const tono = computed(() => {
  if (collection.outbox.length > 0) return 'chip chip-warning';
  return collection.online ? 'chip chip-success' : 'chip';
});
</script>

<template>
  <button :class="tono" :disabled="collection.syncing" @click="collection.sync()">
    {{ texto }}
  </button>
</template>
```

- [ ] **Step 2: Añadir el chip a `frontend/src/components/Navbar.vue`**

Importar `SyncChip` y colocarlo en la barra, alineado a la derecha junto al resto de acciones:

```vue
<SyncChip />
```

- [ ] **Step 3: Verificar la suite completa y el build**

Run: `cd frontend && npm test && npm run build && cd ../backend && npm test`
Expected: 30 tests del frontend y 79 del backend en verde, y el build sin errores.

- [ ] **Step 4: Desplegar en el NAS**

Este paso necesita la rama subida y la contraseña del NAS, que Juan facilita
cuando toca. El despliegue definitivo se hace al cerrar la rama; esto es solo
para poder probar desde el móvil antes de mergear.

Run: `ssh juan@192.168.2.130 'cd ~/listadomanga && git fetch && git checkout feat/pwa-offline && git pull && docker compose up -d --build && sleep 10 && docker compose ps'`
Expected: los dos contenedores arriba y sanos.

- [ ] **Step 5: Verificación en el móvil — la prueba que de verdad importa**

Con el móvil en la wifi de casa:

1. Abrir la app, esperar a que el chip diga `Sincronizado ahora mismo`.
2. Instalarla desde el menú del navegador ("Añadir a pantalla de inicio"). Debe ofrecerlo sin problemas ahora que los iconos son correctos.
3. Navegar por tres o cuatro series para que sus portadas queden cacheadas.
4. **Poner el móvil en modo avión.**
5. Abrir la app desde el icono. Debe pintar al instante, con el chip en `Sin conexión · datos de hace un rato`.
6. Comprobar: la home muestra los pendientes; "Mis series" lista y el buscador encuentra escribiendo sin acentos; entrar en una serie muestra sus tomos con los que tienes marcados.
7. Marcar un tomo como comprado: debe cambiar al momento y el chip pasar a `1 cambio sin enviar`.
8. Quitar el modo avión, volver a la wifi de casa y abrir la app. El chip debe volver a `Sincronizado ahora mismo` y el cambio debe haberse aplicado.
9. Confirmar en el NAS que el tomo consta como comprado:
   ```bash
   sshpass -p "$NAS_PASS" ssh juan@192.168.2.130 'cd ~/listadomanga && docker compose exec -T backend node -e "
   import(\"./src/config/db.js\").then(({ default: db }) => {
     console.log(db.prepare(\"SELECT series_id, volume_number, purchased_at FROM user_volumes ORDER BY purchased_at DESC LIMIT 3\").all());
   });"'
   ```

- [ ] **Step 6: Documentar en el `README.md`**

Añadir al final:

```markdown
## Uso sin conexión (PWA)

La app guarda toda la colección en el móvil, así que funciona en una tienda sin
VPN y sin cobertura: home con los tomos pendientes, tus series con su buscador,
la ficha de cada serie y la wishlist.

Instálala desde el navegador ("Añadir a pantalla de inicio") estando en casa. Al
abrirla pinta al instante con los datos guardados y, en paralelo, intenta
sincronizar con el NAS con un timeout de 2 segundos: si no está accesible, ni te
enteras.

El chip de la barra superior indica el estado: `Sincronizado hace 2 h`,
`Sin conexión · datos de hace 3 días` o `1 cambio sin enviar`. Tocarlo fuerza la
sincronización.

Los tomos que marques como comprados sin conexión se guardan en una cola local y
se envían al NAS en la siguiente sincronización. Buscar series nuevas, las
estadísticas y modificar la wishlist sí requieren conexión, y lo indican.
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/SyncChip.vue frontend/src/components/Navbar.vue README.md
git commit -m "feat(offline): chip de sincronización y documentación"
```

---

## Verificación final

- [ ] `cd frontend && npm test` — 30 tests en verde.
- [ ] `cd backend && npm test` — 79 tests en verde.
- [ ] `cd frontend && npm run build` — sin errores.
- [ ] Paridad comprobada: los pendientes y próximos derivados en local coinciden en número y orden con los del API.
- [ ] El móvil en modo avión abre la app, muestra datos, busca y permite marcar un tomo.
- [ ] El cambio hecho sin conexión aparece en la base del NAS tras volver a casa.
