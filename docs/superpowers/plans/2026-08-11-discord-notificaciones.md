# Notificaciones de novedades a Discord — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar en un canal de Discord, con tarjetas diferenciadas, cuando el scraper detecta tomos recién anunciados o tomos que salen a la venta sin comprar.

**Architecture:** Una tabla `notified_volumes` da memoria persistente de lo ya avisado, de modo que la notificación es idempotente aunque `replaceVolumes()` borre y reinserte todos los tomos en cada sincronización. Cuatro módulos con una responsabilidad cada uno (detección en BD, construcción de embeds, transporte HTTP, orquestación) se enganchan al cron y a los endpoints de refresco mediante una única función `notifyNewReleases()`. Todo el tráfico es saliente: no se expone ningún puerto.

**Tech Stack:** Node 20 (ESM), Express 4, better-sqlite3 11, runner de tests `node --test` integrado en Node (sin dependencias nuevas), `fetch` nativo.

**Spec:** `docs/superpowers/specs/2026-08-11-discord-notificaciones-design.md`

## Global Constraints

- **Sin dependencias nuevas.** El runner de tests es `node --test`, incluido en Node 20; el cliente HTTP es el `fetch` nativo. `better-sqlite3` ya está en `package.json`.
- **ESM en todo el backend** (`"type": "module"`): `import`/`export`, nunca `require`.
- **El secreto solo vive en `.env`.** Nunca en `docker-compose.yml`, ni en el código, ni en los tests, ni en los mensajes de commit. `docker-compose.yml` está en git y el repositorio está publicado en GitHub.
- **Nada de tráfico entrante.** Ninguna tarea abre puertos ni publica servicios. Los enlaces de los embeds apuntan a `listadomanga.es`; las portadas, a `static.listadomanga.com`.
- **Textos de cara al usuario en español**, con precios en formato español: `9,50 €`.
- **Comentarios en español**, siguiendo el estilo del código existente: explican el porqué, no el qué.
- **Colores exactos**: ámbar `0xF59E0B` (`16096779`) para anuncios, verde `0x22C55E` (`2278750`) para tomos a la venta.
- **Valores por defecto exactos**: `DISCORD_SEND_DELAY_MS` = `1500`, `DISCORD_MAX_EMBEDS_PER_RUN` = `30`, máximo de 10 embeds por mensaje (límite de Discord), 3 intentos por mensaje.
- **Rama de trabajo:** `feat/discord-notificaciones`. Todos los commits van ahí.

## Estructura de ficheros

**Se crean:**

| Fichero | Responsabilidad |
|---|---|
| `backend/src/models/scope.js` | Única definición de qué series están en alcance (following + wishlist) |
| `backend/src/services/notifications/detector.js` | Acceso a `notified_volumes`: qué falta por avisar, marcar avisado, línea base |
| `backend/src/services/notifications/embeds.js` | Construcción pura de embeds. Sin BD ni red |
| `backend/src/services/notifications/discord.js` | Transporte: POST al webhook, `?wait=true`, 429, reintentos, troceado |
| `backend/src/services/notifications/index.js` | Orquestación: detectar → enviar → marcar lo confirmado |
| `backend/src/scripts/notify-test.js` | Script manual que manda una tarjeta de ejemplo de cada tipo |
| `backend/test/helpers/db.js` | BD SQLite en memoria y sembradores para los tests |
| `backend/test/detector.test.js` | Tests de detección, marcado y línea base |
| `backend/test/embeds.test.js` | Tests de construcción de embeds |
| `backend/test/discord.test.js` | Tests de transporte con `fetch` simulado |
| `backend/test/notifications.test.js` | Tests de la orquestación completa |
| `.env.example` | Documentación de las variables, con valores vacíos |

**Se modifican:**

| Fichero | Cambio |
|---|---|
| `backend/src/models/database.js` | Extraer `createSchema()`, añadir tabla `notified_volumes` y `seedNotifiedBaseline()` |
| `backend/src/services/cron.js` | Ampliar el bucle a la wishlist y llamar a `notifyNewReleases()` al terminar |
| `backend/src/controllers/series.controller.js` | Notificar tras `refreshSeries` y `refreshAllSeries` |
| `backend/src/controllers/user.controller.js` | Línea base al seguir, re-seguir o añadir a wishlist |
| `backend/package.json` | Scripts `test` y `notify:test` |
| `docker-compose.yml` | Pasar las tres variables al contenedor, por referencia |
| `.gitignore` | Añadir `.env` |
| `README.md` | Sección de notificaciones |

**Nota sobre el spec:** el spec describe tres módulos y este plan usa cuatro. `discord.js` se parte en `embeds.js` (construcción pura, fácil de testear sin red) y `discord.js` (transporte). Es la misma arquitectura con una frontera más.

---

### Task 1: Esquema, línea base e infraestructura de tests

**Files:**
- Create: `backend/src/models/scope.js`
- Create: `backend/test/helpers/db.js`
- Create: `backend/test/schema.test.js`
- Modify: `backend/src/models/database.js`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces:
  - `IN_SCOPE_SERIES_SQL: string` — fragmento SQL que devuelve una columna `series_id`.
  - `createSchema(database): void` — aplica todo el DDL a cualquier handle de better-sqlite3.
  - `seedNotifiedBaseline(database): { announced: number, onSale: number, total: number }`
  - `makeTestDb(): Database`, `addSeries(db, id, extra?)`, `addVolume(db, seriesId, number, extra?)`, `follow(db, seriesId, status?)`, `addWishlist(db, seriesId)`, `buy(db, seriesId, number)`

- [ ] **Step 1: Añadir los scripts de test a `backend/package.json`**

En el bloque `"scripts"`, junto a los existentes:

```json
    "test": "DB_PATH=:memory: DISCORD_WEBHOOK_URL= node --test test/*.test.js",
    "test:watch": "DB_PATH=:memory: DISCORD_WEBHOOK_URL= node --test --watch test/*.test.js",
```

Se pasa un glob y no el directorio `test/`: con el directorio, el runner
intenta cargarlo como módulo y falla. El glob tiene además la ventaja de no
ejecutar `test/helpers/db.js` como si fuera un fichero de tests.

`DB_PATH=:memory:` es obligatorio: `src/models/database.js` abre la conexión al importarse, y sin esa variable los tests crearían un fichero `data.db` suelto.

`DISCORD_WEBHOOK_URL=` la vacía para la suite. Son dos garantías en una: los tests que comprueban el caso "sin webhook configurado" no dependen de lo que tenga el desarrollador en su shell, y ningún test puede acabar enviando un mensaje real al canal.

- [ ] **Step 2: Crear `backend/src/models/scope.js`**

```js
// Series que generan avisos y que el cron debe refrescar: las que sigues
// activamente más las de la wishlist. Las 'discarded' quedan fuera de los
// avisos (aunque el cron las siga refrescando como hasta ahora).
// Vive aquí, y no en el módulo de notificaciones, porque lo usan tanto la
// línea base del esquema como el detector y el cron.
export const IN_SCOPE_SERIES_SQL = `
  SELECT series_id FROM user_series WHERE status = 'following'
  UNION
  SELECT series_id FROM wishlist
`;
```

- [ ] **Step 3: Crear el helper de tests `backend/test/helpers/db.js`**

```js
import Database from 'better-sqlite3';
import { createSchema } from '../../src/models/database.js';

// BD en memoria con el esquema real. Cada test crea la suya, así que no
// hay estado compartido entre tests.
export function makeTestDb() {
  const db = new Database(':memory:');
  createSchema(db);
  return db;
}

export function addSeries(db, id, extra = {}) {
  const s = {
    name: `Serie ${id}`,
    author: 'Autor Ejemplo',
    editorial_es: 'Norma Editorial',
    total_volumes: 10,
    released_volumes: 5,
    url: `https://www.listadomanga.es/coleccion.php?id=${id}`,
    ...extra
  };
  db.prepare(`
    INSERT OR REPLACE INTO series (id, name, author, editorial_es, total_volumes, released_volumes, url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, s.name, s.author, s.editorial_es, s.total_volumes, s.released_volumes, s.url);
}

export function addVolume(db, seriesId, number, extra = {}) {
  const v = {
    title: `Tomo ${number}`,
    pages: 200,
    price: 9.5,
    cover_url: `https://static.listadomanga.com/cover${seriesId}-${number}`,
    is_released: 1,
    release_date: 'Septiembre 2026',
    ...extra
  };
  db.prepare(`
    INSERT OR REPLACE INTO volumes (series_id, number, title, pages, price, cover_url, is_released, release_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(seriesId, number, v.title, v.pages, v.price, v.cover_url, v.is_released, v.release_date);
}

export function follow(db, seriesId, status = 'following') {
  db.prepare('INSERT OR REPLACE INTO user_series (series_id, status) VALUES (?, ?)').run(seriesId, status);
}

export function addWishlist(db, seriesId) {
  db.prepare('INSERT OR REPLACE INTO wishlist (series_id) VALUES (?)').run(seriesId);
}

export function buy(db, seriesId, number) {
  db.prepare('INSERT OR REPLACE INTO user_volumes (series_id, volume_number) VALUES (?, ?)').run(seriesId, number);
}
```

- [ ] **Step 4: Escribir el test que falla `backend/test/schema.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestDb, addSeries, addVolume, follow, addWishlist } from './helpers/db.js';
import { seedNotifiedBaseline } from '../src/models/database.js';

test('la tabla notified_volumes existe y rechaza duplicados del mismo evento', () => {
  const db = makeTestDb();
  db.prepare("INSERT INTO notified_volumes (series_id, volume_number, event_type) VALUES (1, 1, 'announced')").run();

  assert.throws(
    () => db.prepare("INSERT INTO notified_volumes (series_id, volume_number, event_type) VALUES (1, 1, 'announced')").run(),
    /UNIQUE/
  );

  // El mismo tomo sí puede registrar el otro evento.
  db.prepare("INSERT INTO notified_volumes (series_id, volume_number, event_type) VALUES (1, 1, 'on_sale')").run();
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM notified_volumes').get().c, 2);
});

test('la línea base marca announced para todo y on_sale solo para lo publicado', () => {
  const db = makeTestDb();
  addSeries(db, 1);
  follow(db, 1);
  addVolume(db, 1, 1, { is_released: 1 });
  addVolume(db, 1, 2, { is_released: 0 });

  const result = seedNotifiedBaseline(db);

  assert.equal(result.announced, 2);
  assert.equal(result.onSale, 1);
  assert.equal(result.total, 3);
});

test('la línea base incluye la wishlist y excluye las series descartadas', () => {
  const db = makeTestDb();
  addSeries(db, 1); follow(db, 1, 'discarded'); addVolume(db, 1, 1);
  addSeries(db, 2); addWishlist(db, 2); addVolume(db, 2, 1);

  seedNotifiedBaseline(db);

  const rows = db.prepare('SELECT DISTINCT series_id FROM notified_volumes').all();
  assert.deepEqual(rows, [{ series_id: 2 }]);
});

test('la línea base no se vuelve a aplicar si ya hay registros', () => {
  const db = makeTestDb();
  addSeries(db, 1); follow(db, 1); addVolume(db, 1, 1);
  seedNotifiedBaseline(db);

  addVolume(db, 1, 2);
  const second = seedNotifiedBaseline(db);

  assert.equal(second.total, 0);
});
```

- [ ] **Step 5: Ejecutar los tests y verificar que fallan**

Run: `cd backend && npm test`
Expected: FAIL — `createSchema` y `seedNotifiedBaseline` no existen todavía (`SyntaxError: The requested module ... does not provide an export named 'createSchema'`).

- [ ] **Step 6: Refactorizar `backend/src/models/database.js`**

Sustituir el cuerpo de `initDatabase()` por una función `createSchema(database)` que reciba el handle, y dejar `initDatabase()` como envoltorio sobre el singleton. El DDL existente se mueve tal cual; se le añade la tabla nueva.

Reemplazar desde `export function initDatabase() {` hasta el final del fichero por:

```js
// El DDL vive en una función que acepta cualquier handle para que los tests
// puedan levantar el mismo esquema sobre una BD en memoria.
export function createSchema(database) {
  database.exec(`
    -- Series de manga (datos scrapeados)
    CREATE TABLE IF NOT EXISTS series (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      original_name TEXT,
      author TEXT,
      artist TEXT,
      editorial_jp TEXT,
      editorial_es TEXT,
      total_volumes INTEGER,
      is_complete INTEGER DEFAULT 0,
      category TEXT,
      url TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Tomos individuales de cada serie
    CREATE TABLE IF NOT EXISTS volumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL,
      number INTEGER NOT NULL,
      title TEXT,
      pages INTEGER,
      price REAL,
      release_date TEXT,
      cover_url TEXT,
      is_released INTEGER DEFAULT 1,
      FOREIGN KEY (series_id) REFERENCES series(id),
      UNIQUE(series_id, number)
    );

    -- Series que el usuario está siguiendo
    CREATE TABLE IF NOT EXISTS user_series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL UNIQUE,
      status TEXT DEFAULT 'following',
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (series_id) REFERENCES series(id)
    );

    -- Tomos que el usuario ha comprado
    CREATE TABLE IF NOT EXISTS user_volumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL,
      volume_number INTEGER NOT NULL,
      purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (series_id) REFERENCES series(id),
      UNIQUE(series_id, volume_number)
    );

    -- Wishlist del usuario
    CREATE TABLE IF NOT EXISTS wishlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL UNIQUE,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      FOREIGN KEY (series_id) REFERENCES series(id)
    );

    -- Avisos ya enviados a Discord. Da memoria persistente a la notificación:
    -- replaceVolumes() borra y reinserta los tomos en cada sincronización, así
    -- que sin esta tabla no habría forma de saber qué es novedad de verdad.
    CREATE TABLE IF NOT EXISTS notified_volumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL,
      volume_number INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      notified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(series_id, volume_number, event_type)
    );

    -- Índices para mejorar rendimiento
    CREATE INDEX IF NOT EXISTS idx_volumes_series ON volumes(series_id);
    CREATE INDEX IF NOT EXISTS idx_user_volumes_series ON user_volumes(series_id);
    CREATE INDEX IF NOT EXISTS idx_notified_series ON notified_volumes(series_id);

    -- Configuración de la aplicación
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migraciones para tablas existentes
  const migrations = [
    `ALTER TABLE volumes ADD COLUMN is_released INTEGER DEFAULT 1`,
    `ALTER TABLE series ADD COLUMN released_volumes INTEGER DEFAULT 0`,
    `ALTER TABLE series ADD COLUMN synopsis TEXT`,
    `ALTER TABLE series ADD COLUMN reading_direction TEXT`
  ];

  for (const sql of migrations) {
    try {
      database.exec(sql);
    } catch (e) {
      // Columna ya existe
    }
  }
}

// Marca como ya avisado todo lo que hay en la BD, sin enviar nada. Se ejecuta
// una única vez: en cuanto notified_volumes tiene una fila, no vuelve a tocar
// nada. Sin esto, el primer arranque soltaría cientos de tarjetas de golpe.
export function seedNotifiedBaseline(database) {
  const already = database.prepare('SELECT COUNT(*) AS count FROM notified_volumes').get().count;
  if (already > 0) return { announced: 0, onSale: 0, total: 0 };

  const seed = database.transaction(() => {
    // 'announced' para todos los tomos, publicados o no: así un tomo ya
    // conocido nunca podrá disparar un anuncio retroactivo.
    const announced = database.prepare(`
      INSERT OR IGNORE INTO notified_volumes (series_id, volume_number, event_type)
      SELECT v.series_id, v.number, 'announced'
      FROM volumes v
      WHERE v.series_id IN (${IN_SCOPE_SERIES_SQL})
    `).run().changes;

    // 'on_sale' solo para lo ya publicado. Los tomos anunciados sin publicar
    // quedan sin marcar y avisarán cuando salgan, que es lo que se busca.
    const onSale = database.prepare(`
      INSERT OR IGNORE INTO notified_volumes (series_id, volume_number, event_type)
      SELECT v.series_id, v.number, 'on_sale'
      FROM volumes v
      WHERE v.series_id IN (${IN_SCOPE_SERIES_SQL})
        AND v.is_released = 1
    `).run().changes;

    return { announced, onSale, total: announced + onSale };
  });

  return seed();
}

export function initDatabase() {
  createSchema(db);

  const baseline = seedNotifiedBaseline(db);
  if (baseline.total > 0) {
    console.log(`[NOTIF] Línea base creada: ${baseline.announced} anunciados, ${baseline.onSale} a la venta`);
  }

  console.log('Base de datos inicializada');
}

export default db;
```

Añadir el import de `scope.js` arriba del fichero, junto a los que ya hay:

```js
import { IN_SCOPE_SERIES_SQL } from './scope.js';
```

- [ ] **Step 7: Ejecutar los tests y verificar que pasan**

Run: `cd backend && npm test`
Expected: PASS — 4 tests de `schema.test.js`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/models/database.js backend/src/models/scope.js backend/test/ backend/package.json
git commit -m "feat(notif): tabla notified_volumes y línea base inicial"
```

---

### Task 2: Detector de eventos pendientes

**Files:**
- Create: `backend/src/services/notifications/detector.js`
- Create: `backend/test/detector.test.js`

**Interfaces:**
- Consumes: `IN_SCOPE_SERIES_SQL` de `src/models/scope.js`; helpers de `test/helpers/db.js`.
- Produces:
  - `findPendingEvents(database): Event[]` donde `Event` es
    `{ event_type: 'announced'|'on_sale', series_id, volume_number, price, pages, release_date, cover_url, series_name, author, editorial_es, series_url, total_volumes, released_volumes, owned_count, missing_count, in_wishlist }`
  - `markNotified(database, events): void`
  - `markSeriesBaseline(database, seriesId): void`

- [ ] **Step 1: Escribir el test que falla `backend/test/detector.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestDb, addSeries, addVolume, follow, addWishlist, buy } from './helpers/db.js';
import { findPendingEvents, markNotified, markSeriesBaseline } from '../src/services/notifications/detector.js';

test('un tomo nuevo sin publicar genera un evento announced', () => {
  const db = makeTestDb();
  addSeries(db, 1); follow(db, 1);
  addVolume(db, 1, 1, { is_released: 0 });

  const events = findPendingEvents(db);

  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'announced');
  assert.equal(events[0].volume_number, 1);
  assert.equal(events[0].series_name, 'Serie 1');
});

test('un tomo publicado y sin comprar genera un evento on_sale', () => {
  const db = makeTestDb();
  addSeries(db, 1); follow(db, 1);
  addVolume(db, 1, 1, { is_released: 1 });

  const events = findPendingEvents(db);

  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'on_sale');
});

test('un tomo publicado ya comprado no genera ningún evento', () => {
  const db = makeTestDb();
  addSeries(db, 1); follow(db, 1);
  addVolume(db, 1, 1, { is_released: 1 });
  buy(db, 1, 1);

  assert.deepEqual(findPendingEvents(db), []);
});

test('marcar los eventos los elimina de la siguiente detección', () => {
  const db = makeTestDb();
  addSeries(db, 1); follow(db, 1);
  addVolume(db, 1, 1, { is_released: 0 });

  markNotified(db, findPendingEvents(db));

  assert.deepEqual(findPendingEvents(db), []);
});

test('un tomo anunciado que pasa a publicado genera después un on_sale', () => {
  const db = makeTestDb();
  addSeries(db, 1); follow(db, 1);
  addVolume(db, 1, 1, { is_released: 0 });
  markNotified(db, findPendingEvents(db));

  addVolume(db, 1, 1, { is_released: 1 });
  const events = findPendingEvents(db);

  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'on_sale');
});

test('las series descartadas no generan eventos y las de wishlist sí', () => {
  const db = makeTestDb();
  addSeries(db, 1); follow(db, 1, 'discarded'); addVolume(db, 1, 1);
  addSeries(db, 2); addWishlist(db, 2); addVolume(db, 2, 1);

  const events = findPendingEvents(db);

  assert.equal(events.length, 1);
  assert.equal(events[0].series_id, 2);
  assert.equal(events[0].in_wishlist, 1);
});

test('el evento trae el contexto de colección de la serie', () => {
  const db = makeTestDb();
  addSeries(db, 1, { total_volumes: 9 }); follow(db, 1);
  addVolume(db, 1, 1, { is_released: 1 });
  addVolume(db, 1, 2, { is_released: 1 });
  addVolume(db, 1, 3, { is_released: 1 });
  buy(db, 1, 1);
  buy(db, 1, 2);

  const event = findPendingEvents(db)[0];

  assert.equal(event.owned_count, 2);
  assert.equal(event.missing_count, 1);
  assert.equal(event.total_volumes, 9);
});

test('la línea base de una serie silencia sus tomos actuales', () => {
  const db = makeTestDb();
  addSeries(db, 1); follow(db, 1);
  addVolume(db, 1, 1, { is_released: 1 });
  addVolume(db, 1, 2, { is_released: 0 });

  markSeriesBaseline(db, 1);

  assert.deepEqual(findPendingEvents(db), []);
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module .../services/notifications/detector.js`.

- [ ] **Step 3: Crear `backend/src/services/notifications/detector.js`**

```js
import { IN_SCOPE_SERIES_SQL } from '../../models/scope.js';

// Columnas comunes a los dos tipos de evento. Se comparten para que la tarjeta
// de Discord se construya siempre con la misma forma de objeto.
const EVENT_COLUMNS = `
  v.series_id,
  v.number              AS volume_number,
  v.price,
  v.pages,
  v.release_date,
  v.cover_url,
  s.name                AS series_name,
  s.author,
  s.editorial_es,
  s.url                 AS series_url,
  s.total_volumes,
  s.released_volumes,
  (SELECT COUNT(*) FROM user_volumes uv WHERE uv.series_id = v.series_id) AS owned_count,
  (SELECT COUNT(*)
     FROM volumes v2
     LEFT JOIN user_volumes uv2
       ON uv2.series_id = v2.series_id AND uv2.volume_number = v2.number
    WHERE v2.series_id = v.series_id AND v2.is_released = 1 AND uv2.id IS NULL) AS missing_count,
  EXISTS(SELECT 1 FROM wishlist w WHERE w.series_id = v.series_id) AS in_wishlist
`;

const NOT_YET_NOTIFIED = `
  NOT EXISTS (
    SELECT 1 FROM notified_volumes n
     WHERE n.series_id = v.series_id
       AND n.volume_number = v.number
       AND n.event_type = ?
  )
`;

// Tomos que han aparecido en el listado y aún no están publicados.
const ANNOUNCED_SQL = `
  SELECT ${EVENT_COLUMNS}, 'announced' AS event_type
  FROM volumes v
  JOIN series s ON s.id = v.series_id
  WHERE v.series_id IN (${IN_SCOPE_SERIES_SQL})
    AND v.is_released = 0
    AND ${NOT_YET_NOTIFIED}
  ORDER BY s.name, v.number
`;

// Tomos ya a la venta que no figuran como comprados.
const ON_SALE_SQL = `
  SELECT ${EVENT_COLUMNS}, 'on_sale' AS event_type
  FROM volumes v
  JOIN series s ON s.id = v.series_id
  WHERE v.series_id IN (${IN_SCOPE_SERIES_SQL})
    AND v.is_released = 1
    AND NOT EXISTS (
      SELECT 1 FROM user_volumes uv
       WHERE uv.series_id = v.series_id AND uv.volume_number = v.number
    )
    AND ${NOT_YET_NOTIFIED}
  ORDER BY s.name, v.number
`;

// Devuelve todo lo pendiente de avisar. Siempre mira el estado global de la BD,
// no la serie que se acabe de sincronizar: así un envío que falló ayer se
// recupera en la siguiente llamada, venga de donde venga.
export function findPendingEvents(database) {
  const announced = database.prepare(ANNOUNCED_SQL).all('announced');
  const onSale = database.prepare(ON_SALE_SQL).all('on_sale');
  return [...announced, ...onSale];
}

export function markNotified(database, events) {
  if (events.length === 0) return;

  const insert = database.prepare(`
    INSERT OR IGNORE INTO notified_volumes (series_id, volume_number, event_type)
    VALUES (?, ?, ?)
  `);

  const markAll = database.transaction((rows) => {
    for (const e of rows) insert.run(e.series_id, e.volume_number, e.event_type);
  });

  markAll(events);
}

// Registra los tomos actuales de una serie como ya avisados, sin enviar nada.
// Se usa al empezar a seguir una serie: añadir una de 40 tomos no debe
// disparar 40 tarjetas.
export function markSeriesBaseline(database, seriesId) {
  const baseline = database.transaction(() => {
    database.prepare(`
      INSERT OR IGNORE INTO notified_volumes (series_id, volume_number, event_type)
      SELECT series_id, number, 'announced' FROM volumes WHERE series_id = ?
    `).run(seriesId);

    database.prepare(`
      INSERT OR IGNORE INTO notified_volumes (series_id, volume_number, event_type)
      SELECT series_id, number, 'on_sale' FROM volumes WHERE series_id = ? AND is_released = 1
    `).run(seriesId);
  });

  baseline();
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `cd backend && npm test`
Expected: PASS — 8 tests de `detector.test.js` más los 4 de la tarea anterior.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/notifications/detector.js backend/test/detector.test.js
git commit -m "feat(notif): detector de tomos anunciados y a la venta"
```

---

### Task 3: Construcción de las tarjetas

**Files:**
- Create: `backend/src/services/notifications/embeds.js`
- Create: `backend/test/embeds.test.js`

**Interfaces:**
- Consumes: objetos `Event` de `detector.js`.
- Produces:
  - `buildEmbed(event, { now?: Date }): object` — embed de Discord listo para enviar.
  - `formatPrice(price): string|null`
  - `COLOR_ANNOUNCED: 16096779`, `COLOR_ON_SALE: 2278750`

- [ ] **Step 1: Escribir el test que falla `backend/test/embeds.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmbed, formatPrice, COLOR_ANNOUNCED, COLOR_ON_SALE } from '../src/services/notifications/embeds.js';

const NOW = new Date('2026-08-11T09:00:00.000Z');

function makeEvent(extra = {}) {
  return {
    event_type: 'announced',
    series_id: 1,
    volume_number: 9,
    price: 9.5,
    pages: 200,
    release_date: 'Noviembre 2026',
    cover_url: 'https://static.listadomanga.com/cover',
    series_name: 'Kagurabachi',
    author: 'Takeru Hokazono',
    editorial_es: 'Norma Editorial',
    series_url: 'https://www.listadomanga.es/coleccion.php?id=1',
    total_volumes: 9,
    released_volumes: 8,
    owned_count: 8,
    missing_count: 1,
    in_wishlist: 0,
    ...extra
  };
}

test('formatPrice usa formato español y descarta valores vacíos', () => {
  assert.equal(formatPrice(9.5), '9,50 €');
  assert.equal(formatPrice(16), '16,00 €');
  assert.equal(formatPrice(0), null);
  assert.equal(formatPrice(null), null);
});

test('la tarjeta de anuncio va en ámbar, con miniatura y fecha prevista', () => {
  const embed = buildEmbed(makeEvent(), { now: NOW });

  assert.equal(embed.color, COLOR_ANNOUNCED);
  assert.equal(embed.author.name, '📢 Nuevo tomo anunciado');
  assert.equal(embed.title, 'Kagurabachi #9');
  assert.equal(embed.url, 'https://www.listadomanga.es/coleccion.php?id=1');
  assert.equal(embed.thumbnail.url, 'https://static.listadomanga.com/cover');
  assert.equal(embed.image, undefined);
  assert.equal(embed.timestamp, NOW.toISOString());

  const fields = Object.fromEntries(embed.fields.map(f => [f.name, f.value]));
  assert.equal(fields['Editorial'], 'Norma Editorial');
  assert.equal(fields['Precio'], '9,50 €');
  assert.equal(fields['Salida prevista'], 'Noviembre 2026');
  assert.equal(fields['Tu colección'], 'Tienes 8 de 9 tomos');
  assert.equal(embed.footer.text, 'Takeru Hokazono');
});

test('la tarjeta de venta va en verde, con portada grande y tomos pendientes', () => {
  const embed = buildEmbed(makeEvent({ event_type: 'on_sale', missing_count: 3 }), { now: NOW });

  assert.equal(embed.color, COLOR_ON_SALE);
  assert.equal(embed.author.name, '🛒 Ya a la venta');
  assert.equal(embed.image.url, 'https://static.listadomanga.com/cover');
  assert.equal(embed.thumbnail, undefined);

  const fields = Object.fromEntries(embed.fields.map(f => [f.name, f.value]));
  assert.equal(fields['Páginas'], '200');
  assert.equal(fields['Pendiente'], 'Te faltan 3 tomos de esta serie');
  assert.equal(fields['Salida prevista'], undefined);
});

test('la wishlist se indica en el pie', () => {
  const embed = buildEmbed(makeEvent({ in_wishlist: 1 }), { now: NOW });
  assert.equal(embed.footer.text, 'Takeru Hokazono · ⭐ En tu wishlist');
});

test('sin portada, sin precio y sin fecha la tarjeta se construye igual', () => {
  const embed = buildEmbed(
    makeEvent({ cover_url: null, price: 0, release_date: null, pages: 0, author: null }),
    { now: NOW }
  );

  assert.equal(embed.thumbnail, undefined);
  assert.equal(embed.image, undefined);
  assert.equal(embed.footer, undefined);
  const names = embed.fields.map(f => f.name);
  assert.ok(!names.includes('Precio'));
  assert.ok(!names.includes('Salida prevista'));
});

test('el contexto de colección se omite si no se conoce el total', () => {
  const embed = buildEmbed(makeEvent({ total_volumes: 0, released_volumes: 0 }), { now: NOW });
  const names = embed.fields.map(f => f.name);
  assert.ok(!names.includes('Tu colección'));
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module .../notifications/embeds.js`.

- [ ] **Step 3: Crear `backend/src/services/notifications/embeds.js`**

```js
// Los dos tipos de aviso se distinguen a golpe de vista: color de barra,
// cabecera, tamaño de portada y campos.
export const COLOR_ANNOUNCED = 0xf59e0b; // ámbar
export const COLOR_ON_SALE = 0x22c55e;   // verde

export function formatPrice(price) {
  if (!price || price <= 0) return null;
  return `${price.toFixed(2).replace('.', ',')} €`;
}

function field(name, value, inline = true) {
  if (value === null || value === undefined || value === '') return null;
  return { name, value: String(value), inline };
}

// 'Tienes 8 de 9 tomos'. Si la serie no tiene total conocido no se muestra:
// un '8 de 0' quedaría absurdo.
function collectionField(event) {
  const total = event.total_volumes || event.released_volumes;
  if (!total) return null;
  return field('Tu colección', `Tienes ${event.owned_count} de ${total} tomos`, false);
}

function pendingField(event) {
  if (!event.missing_count) return null;
  const plural = event.missing_count === 1 ? 'tomo' : 'tomos';
  return field('Pendiente', `Te faltan ${event.missing_count} ${plural} de esta serie`, false);
}

function footer(event) {
  const parts = [];
  if (event.author) parts.push(event.author);
  if (event.in_wishlist) parts.push('⭐ En tu wishlist');
  if (parts.length === 0) return undefined;
  return { text: parts.join(' · ') };
}

export function buildEmbed(event, { now = new Date() } = {}) {
  const isAnnounced = event.event_type === 'announced';

  const fields = isAnnounced
    ? [
        field('Editorial', event.editorial_es),
        field('Precio', formatPrice(event.price)),
        field('Salida prevista', event.release_date),
        collectionField(event)
      ]
    : [
        field('Editorial', event.editorial_es),
        field('Precio', formatPrice(event.price)),
        field('Páginas', event.pages || null),
        pendingField(event)
      ];

  const embed = {
    author: { name: isAnnounced ? '📢 Nuevo tomo anunciado' : '🛒 Ya a la venta' },
    title: `${event.series_name} #${event.volume_number}`,
    url: event.series_url,
    color: isAnnounced ? COLOR_ANNOUNCED : COLOR_ON_SALE,
    fields: fields.filter(Boolean),
    timestamp: now.toISOString()
  };

  // El anuncio lleva miniatura y el tomo a la venta portada grande: es el que
  // invita a comprar, así que se le da protagonismo visual.
  if (event.cover_url) {
    if (isAnnounced) embed.thumbnail = { url: event.cover_url };
    else embed.image = { url: event.cover_url };
  }

  const foot = footer(event);
  if (foot) embed.footer = foot;

  return embed;
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `cd backend && npm test`
Expected: PASS — 6 tests de `embeds.test.js`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/notifications/embeds.js backend/test/embeds.test.js
git commit -m "feat(notif): tarjetas diferenciadas para anuncio y venta"
```

---

### Task 4: Transporte hacia Discord

**Files:**
- Create: `backend/src/services/notifications/discord.js`
- Create: `backend/test/discord.test.js`

**Interfaces:**
- Consumes: nada del proyecto; solo `fetch`.
- Produces:
  - `MAX_EMBEDS_PER_MESSAGE: 10`
  - `chunk(items, size): T[][]`
  - `sleep(ms): Promise<void>`
  - `sendMessage({ embeds, content }, { webhookUrl, fetchImpl, sleepImpl, maxRetries }): Promise<string>` — devuelve el id del mensaje creado; lanza si no se pudo enviar.

- [ ] **Step 1: Escribir el test que falla `backend/test/discord.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendMessage, chunk, MAX_EMBEDS_PER_MESSAGE } from '../src/services/notifications/discord.js';

const WEBHOOK = 'https://discord.test/webhooks/1/token';
const EMBEDS = [{ title: 'Serie #1' }];

function okResponse(id = '123') {
  return { ok: true, status: 200, json: async () => ({ id }) };
}

test('chunk trocea en grupos del tamaño pedido', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(MAX_EMBEDS_PER_MESSAGE, 10);
});

test('envía con wait=true y devuelve el id confirmado', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return okResponse('999'); };

  const id = await sendMessage({ embeds: EMBEDS }, { webhookUrl: WEBHOOK, fetchImpl });

  assert.equal(id, '999');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${WEBHOOK}?wait=true`);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body).embeds, EMBEDS);
});

test('ante un 429 espera lo que indica retry_after y reintenta', async () => {
  const waits = [];
  let call = 0;
  const fetchImpl = async () => {
    call++;
    if (call === 1) return { ok: false, status: 429, json: async () => ({ retry_after: 2 }) };
    return okResponse();
  };

  await sendMessage({ embeds: EMBEDS }, {
    webhookUrl: WEBHOOK,
    fetchImpl,
    sleepImpl: async (ms) => { waits.push(ms); }
  });

  assert.equal(call, 2);
  assert.deepEqual(waits, [2000]);
});

test('reintenta los fallos de red con espera creciente y acaba lanzando', async () => {
  const waits = [];
  const fetchImpl = async () => { throw new Error('ECONNRESET'); };

  await assert.rejects(
    () => sendMessage({ embeds: EMBEDS }, {
      webhookUrl: WEBHOOK,
      fetchImpl,
      sleepImpl: async (ms) => { waits.push(ms); },
      maxRetries: 3
    }),
    /ECONNRESET/
  );

  assert.deepEqual(waits, [1000, 2000]);
});

test('un 400 no se reintenta: el mensaje es inválido', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: false, status: 400, text: async () => 'Invalid embed' }; };

  await assert.rejects(
    () => sendMessage({ embeds: EMBEDS }, { webhookUrl: WEBHOOK, fetchImpl, sleepImpl: async () => {} }),
    /400/
  );

  assert.equal(calls, 1);
});

test('el content opcional viaja en el cuerpo', async () => {
  let body;
  const fetchImpl = async (url, options) => { body = JSON.parse(options.body); return okResponse(); };

  await sendMessage({ embeds: EMBEDS, content: '…y otros 5 tomos más' }, { webhookUrl: WEBHOOK, fetchImpl });

  assert.equal(body.content, '…y otros 5 tomos más');
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module .../notifications/discord.js`.

- [ ] **Step 3: Crear `backend/src/services/notifications/discord.js`**

```js
// Límite de Discord: 10 embeds por mensaje.
export const MAX_EMBEDS_PER_MESSAGE = 10;

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Envía un mensaje y espera confirmación. El '?wait=true' hace que Discord
// responda con el mensaje ya creado en vez del 204 a ciegas de siempre: sin esa
// confirmación no se marca nada como notificado.
export async function sendMessage({ embeds, content }, {
  webhookUrl = process.env.DISCORD_WEBHOOK_URL,
  fetchImpl = fetch,
  sleepImpl = sleep,
  maxRetries = 3
} = {}) {
  if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL no está definida');

  const body = JSON.stringify(content ? { content, embeds } : { embeds });
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchImpl(`${webhookUrl}?wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      if (res.ok) {
        const message = await res.json();
        return message.id;
      }

      // Rate limit: Discord dice cuántos segundos hay que esperar.
      if (res.status === 429) {
        const { retry_after: retryAfter = 1 } = await res.json();
        await sleepImpl(Math.ceil(retryAfter * 1000));
        continue;
      }

      // Un 4xx que no sea 429 es culpa del mensaje, no de la red: reintentar
      // no arregla nada.
      if (res.status < 500) {
        const detail = await res.text();
        throw new Error(`Discord respondió ${res.status}: ${detail}`);
      }

      lastError = new Error(`Discord respondió ${res.status}`);
    } catch (err) {
      if (/^Discord respondió 4/.test(err.message)) throw err;
      lastError = err;
    }

    if (attempt < maxRetries) await sleepImpl(1000 * 2 ** (attempt - 1));
  }

  throw lastError;
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `cd backend && npm test`
Expected: PASS — 6 tests de `discord.test.js`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/notifications/discord.js backend/test/discord.test.js
git commit -m "feat(notif): cliente del webhook con confirmación y reintentos"
```

---

### Task 5: Orquestación y configuración

**Files:**
- Create: `backend/src/services/notifications/index.js`
- Create: `backend/test/notifications.test.js`
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `findPendingEvents`, `markNotified`, `markSeriesBaseline` (Task 2); `buildEmbed` (Task 3); `chunk`, `sendMessage`, `sleep`, `MAX_EMBEDS_PER_MESSAGE` (Task 4).
- Produces:
  - `notifyNewReleases(overrides?): Promise<{ sent: number, pending: number, skipped?: boolean }>`
  - `notifyNewReleasesInBackground(): void` — dispara y captura errores, para no bloquear respuestas HTTP.
  - `markSeriesAsBaseline(seriesId, database?): void`

- [ ] **Step 1: Escribir el test que falla `backend/test/notifications.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestDb, addSeries, addVolume, follow } from './helpers/db.js';
import { findPendingEvents } from '../src/services/notifications/detector.js';
import { notifyNewReleases } from '../src/services/notifications/index.js';

const WEBHOOK = 'https://discord.test/webhooks/1/token';

function fakeSender(sent) {
  return async ({ embeds, content }) => { sent.push({ embeds, content }); return 'msg-id'; };
}

function dbWith(volumeCount) {
  const db = makeTestDb();
  addSeries(db, 1); follow(db, 1);
  for (let n = 1; n <= volumeCount; n++) addVolume(db, 1, n, { is_released: 1 });
  return db;
}

test('sin webhook configurado no envía nada y no marca nada', async () => {
  const db = dbWith(1);

  const result = await notifyNewReleases({ database: db, webhookUrl: undefined });

  assert.equal(result.skipped, true);
  assert.equal(findPendingEvents(db).length, 1);
});

test('envía las novedades y las marca como avisadas', async () => {
  const db = dbWith(2);
  const sent = [];

  const result = await notifyNewReleases({ database: db, webhookUrl: WEBHOOK, sendImpl: fakeSender(sent) });

  assert.equal(result.sent, 2);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].embeds.length, 2);
  assert.deepEqual(findPendingEvents(db), []);
});

test('trocea en mensajes de 10 embeds y espera entre envíos', async () => {
  const db = dbWith(12);
  const sent = [];
  const waits = [];

  await notifyNewReleases({
    database: db,
    webhookUrl: WEBHOOK,
    sendImpl: fakeSender(sent),
    sleepImpl: async (ms) => { waits.push(ms); },
    delayMs: 1500
  });

  assert.equal(sent.length, 2);
  assert.equal(sent[0].embeds.length, 10);
  assert.equal(sent[1].embeds.length, 2);
  assert.deepEqual(waits, [1500]);
});

test('respeta el tope por ejecución y avisa de lo que queda', async () => {
  const db = dbWith(15);
  const sent = [];

  const result = await notifyNewReleases({
    database: db,
    webhookUrl: WEBHOOK,
    sendImpl: fakeSender(sent),
    sleepImpl: async () => {},
    maxPerRun: 10
  });

  assert.equal(result.sent, 10);
  assert.equal(sent.at(-1).content, '…y otros 5 tomos más');
  // Los 5 restantes siguen pendientes para la próxima ejecución.
  assert.equal(findPendingEvents(db).length, 5);
});

test('si el envío falla, esos tomos no se marcan', async () => {
  const db = dbWith(2);

  const result = await notifyNewReleases({
    database: db,
    webhookUrl: WEBHOOK,
    sendImpl: async () => { throw new Error('Discord caído'); }
  });

  assert.equal(result.sent, 0);
  assert.equal(findPendingEvents(db).length, 2);
});

test('sin novedades no llama a Discord', async () => {
  const db = makeTestDb();
  let called = false;

  const result = await notifyNewReleases({
    database: db,
    webhookUrl: WEBHOOK,
    sendImpl: async () => { called = true; return 'id'; }
  });

  assert.equal(result.sent, 0);
  assert.equal(called, false);
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module .../notifications/index.js`.

- [ ] **Step 3: Crear `backend/src/services/notifications/index.js`**

```js
import db from '../../config/db.js';
import { findPendingEvents, markNotified, markSeriesBaseline } from './detector.js';
import { buildEmbed } from './embeds.js';
import { chunk, sendMessage, sleep, MAX_EMBEDS_PER_MESSAGE } from './discord.js';

const DEFAULT_DELAY_MS = 1500;
const DEFAULT_MAX_PER_RUN = 30;

// El aviso se dispara en cualquier actualización, y refrescar todo tarda
// minutos: este cerrojo evita que dos ejecuciones solapadas manden lo mismo
// dos veces.
let running = false;

export async function notifyNewReleases({
  database = db,
  webhookUrl = process.env.DISCORD_WEBHOOK_URL,
  sendImpl = sendMessage,
  sleepImpl = sleep,
  delayMs = Number(process.env.DISCORD_SEND_DELAY_MS) || DEFAULT_DELAY_MS,
  maxPerRun = Number(process.env.DISCORD_MAX_EMBEDS_PER_RUN) || DEFAULT_MAX_PER_RUN
} = {}) {
  if (!webhookUrl) return { sent: 0, pending: 0, skipped: true };
  if (running) return { sent: 0, pending: 0, skipped: true };

  running = true;
  try {
    const all = findPendingEvents(database);
    if (all.length === 0) return { sent: 0, pending: 0 };

    const events = all.slice(0, maxPerRun);
    const overflow = all.length - events.length;
    const batches = chunk(events, MAX_EMBEDS_PER_MESSAGE);

    let sent = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const isLast = i === batches.length - 1;
      const content = isLast && overflow > 0 ? `…y otros ${overflow} tomos más` : undefined;

      try {
        await sendImpl({ embeds: batch.map(e => buildEmbed(e)), content }, { webhookUrl });
      } catch (err) {
        // Lo no enviado se queda sin marcar y sale en la próxima ejecución.
        console.error(`[NOTIF] Fallo al enviar a Discord: ${err.message}`);
        break;
      }

      markNotified(database, batch);
      sent += batch.length;

      if (!isLast) await sleepImpl(delayMs);
    }

    if (sent > 0) console.log(`[NOTIF] ${sent} novedades enviadas a Discord`);

    return { sent, pending: all.length - sent };
  } finally {
    running = false;
  }
}

// Para los endpoints HTTP: notificar no debe hacer esperar a la respuesta.
export function notifyNewReleasesInBackground() {
  notifyNewReleases().catch(err => console.error(`[NOTIF] ${err.message}`));
}

export function markSeriesAsBaseline(seriesId, database = db) {
  markSeriesBaseline(database, seriesId);
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `cd backend && npm test`
Expected: PASS — 6 tests de `notifications.test.js`.

- [ ] **Step 5: Añadir `.env` al `.gitignore`**

El fichero `.gitignore` de la raíz pasa a:

```
data/
node_modules/
dist/
*.log
.DS_Store
.env
```

- [ ] **Step 6: Crear `.env.example` en la raíz**

```bash
# URL del webhook de Discord al que se envían las novedades.
# Se obtiene en Ajustes del canal → Integraciones → Webhooks.
# Sin este valor, las notificaciones quedan desactivadas.
DISCORD_WEBHOOK_URL=

# Pausa entre mensajes, en milisegundos. Evita saturar el webhook.
DISCORD_SEND_DELAY_MS=1500

# Tope de tarjetas por ejecución. Lo que sobre se envía en la siguiente.
DISCORD_MAX_EMBEDS_PER_RUN=30
```

- [ ] **Step 7: Pasar las variables al contenedor en `docker-compose.yml`**

En el bloque `environment:` del servicio `backend`, tras la línea `- TZ=Europe/Madrid`:

```yaml
      # El valor real vive en .env (fuera de git): este fichero está publicado
      # en GitHub y quien tenga la URL puede publicar en el canal.
      - DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL:-}
      - DISCORD_SEND_DELAY_MS=${DISCORD_SEND_DELAY_MS:-1500}
      - DISCORD_MAX_EMBEDS_PER_RUN=${DISCORD_MAX_EMBEDS_PER_RUN:-30}
```

- [ ] **Step 8: Verificar que compose resuelve las variables sin filtrar el secreto**

Run: `cd /home/juan/Documentos/Desarrollo/listadomanga && docker compose config | grep DISCORD`
Expected: se ven las tres variables; `DISCORD_WEBHOOK_URL` vacía mientras no exista `.env`.

Run: `git check-ignore -v .env`
Expected: `.gitignore:6:.env	.env`

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/notifications/index.js backend/test/notifications.test.js .gitignore .env.example docker-compose.yml
git commit -m "feat(notif): orquestación del envío y configuración por entorno"
```

---

### Task 6: Integración con el cron y los endpoints

**Files:**
- Modify: `backend/src/services/cron.js`
- Modify: `backend/src/controllers/series.controller.js`
- Modify: `backend/src/controllers/user.controller.js`

**Interfaces:**
- Consumes: `notifyNewReleases`, `notifyNewReleasesInBackground`, `markSeriesAsBaseline` (Task 5); `IN_SCOPE_SERIES_SQL` (Task 1).
- Produces: nada nuevo; conecta lo anterior a la aplicación.

- [ ] **Step 1: Ampliar el bucle del cron a la wishlist**

En `backend/src/services/cron.js`, sustituir la consulta de `updateAllUserSeries()`:

```js
  const userSeries = db.prepare(`
    SELECT us.series_id, s.name
    FROM user_series us
    LEFT JOIN series s ON s.id = us.series_id
  `).all();
```

por:

```js
  // Se refrescan todas las series del usuario (siguiendo y descartadas, como
  // hasta ahora) más las de la wishlist, que hasta ahora no se actualizaban
  // nunca porque el bucle solo miraba user_series.
  const userSeries = db.prepare(`
    SELECT us.series_id AS series_id, s.name AS name
    FROM user_series us
    LEFT JOIN series s ON s.id = us.series_id
    UNION
    SELECT w.series_id AS series_id, s.name AS name
    FROM wishlist w
    LEFT JOIN series s ON s.id = w.series_id
  `).all();
```

- [ ] **Step 2: Llamar a la notificación al terminar el cron**

Añadir el import en la cabecera de `backend/src/services/cron.js`:

```js
import { notifyNewReleases } from './notifications/index.js';
```

Y en `updateAllUserSeries()`, justo después de `setLastRefresh();` y antes del `console.log` final:

```js
  await notifyNewReleases();
```

- [ ] **Step 3: Notificar tras los refrescos manuales**

En `backend/src/controllers/series.controller.js`, añadir el import:

```js
import { notifyNewReleasesInBackground } from '../services/notifications/index.js';
```

En `refreshSeries`, justo antes del `res.json({...})` final (línea ~100):

```js
  notifyNewReleasesInBackground();
```

En `refreshAllSeries`, antes de su `res.json` final, la misma línea:

```js
  notifyNewReleasesInBackground();
```

- [ ] **Step 4: Aplicar línea base al entrar una serie en alcance**

En `backend/src/controllers/user.controller.js`, añadir el import:

```js
import { markSeriesAsBaseline } from '../services/notifications/index.js';
```

En `followSeries`, entre el `INSERT` y el `res.json`:

```js
  // Los tomos que ya tiene esa serie no son novedad: se marcan sin avisar para
  // que seguir una serie de 40 tomos no dispare 40 tarjetas.
  markSeriesAsBaseline(seriesId);
```

La misma línea (sin repetir el comentario) en `refollowSeries` y en `addToWishlist`, en ambos casos entre la escritura en BD y el `res.json`.

- [ ] **Step 5: Verificar que la suite sigue en verde**

Run: `cd backend && npm test`
Expected: PASS — los 30 tests de las tareas anteriores.

- [ ] **Step 6: Copiar la base de datos antes de la primera migración**

Este es el arranque en el que se crea la línea base, y es irreversible en la
práctica: si el alcance estuviera mal, quedarían marcados como avisados tomos
que deberían haber notificado. Antes de levantar nada, copia de seguridad —
igual que se hizo con `manga.db.bak-pre-refactor`:

Run: `cd /home/juan/Documentos/Desarrollo/listadomanga && cp data/manga.db data/manga.db.bak-pre-notif && ls -la data/`
Expected: aparece `manga.db.bak-pre-notif` con el mismo tamaño que `manga.db`.

Nótese que en este punto todavía no existe `.env`, así que el backend arranca
sin `DISCORD_WEBHOOK_URL`: la línea base se crea y se registra en el log, pero
no se envía nada. El webhook se configura en la Task 7, después de revisar los
recuentos.

- [ ] **Step 7: Verificar que la app arranca y el cron incluye la wishlist**

Run: `cd /home/juan/Documentos/Desarrollo/listadomanga && docker compose up -d --build backend && docker compose logs --tail=30 backend`
Expected: en el log aparece `[NOTIF] Línea base creada: ... anunciados, ... a la venta` (solo la primera vez), `Base de datos inicializada` y `[CRON] Próxima actualización programada: ...`, sin errores.

Run: `curl -s localhost:4001/api/health`
Expected: `{"status":"ok"}`

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/cron.js backend/src/controllers/series.controller.js backend/src/controllers/user.controller.js
git commit -m "feat(notif): enganchar avisos al cron y a los refrescos"
```

---

### Task 7: Prueba real contra el canal y documentación

**Files:**
- Create: `backend/src/scripts/notify-test.js`
- Modify: `backend/package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: `buildEmbed` (Task 3), `sendMessage` (Task 4).
- Produces: script `npm run notify:test`.

- [ ] **Step 1: Crear `backend/src/scripts/notify-test.js`**

```js
// Manda una tarjeta de ejemplo de cada tipo al canal configurado, para revisar
// el formato real sin esperar a que haya novedades. No toca la base de datos.
import { buildEmbed } from '../services/notifications/embeds.js';
import { sendMessage } from '../services/notifications/discord.js';

const SAMPLES = [
  {
    event_type: 'announced',
    series_id: 1,
    volume_number: 9,
    price: 9.5,
    pages: 208,
    release_date: 'Noviembre 2026',
    cover_url: 'https://static.listadomanga.com/0c10ab3add52c1c2e04d156a70bd',
    series_name: '[PRUEBA] Serie de ejemplo',
    author: 'Autor de Ejemplo',
    editorial_es: 'Norma Editorial',
    series_url: 'https://www.listadomanga.es/',
    total_volumes: 9,
    released_volumes: 8,
    owned_count: 8,
    missing_count: 1,
    in_wishlist: 0
  },
  {
    event_type: 'on_sale',
    series_id: 2,
    volume_number: 21,
    price: 8.95,
    pages: 192,
    release_date: 'Agosto 2026',
    cover_url: 'https://static.listadomanga.com/b7f3e871c47125430202f8d49460',
    series_name: '[PRUEBA] Otra serie',
    author: 'Otra Autoría',
    editorial_es: 'Planeta Cómic',
    series_url: 'https://www.listadomanga.es/',
    total_volumes: 25,
    released_volumes: 21,
    owned_count: 18,
    missing_count: 3,
    in_wishlist: 1
  }
];

if (!process.env.DISCORD_WEBHOOK_URL) {
  console.error('Falta DISCORD_WEBHOOK_URL. Defínela en .env y vuelve a ejecutar.');
  process.exit(1);
}

const id = await sendMessage({ embeds: SAMPLES.map(e => buildEmbed(e)) });
console.log(`Mensaje de prueba enviado (id ${id}). Revisa el canal.`);
```

- [ ] **Step 2: Añadir el script a `backend/package.json`**

En `"scripts"`:

```json
    "notify:test": "node src/scripts/notify-test.js",
```

- [ ] **Step 3: Configurar el webhook real y lanzar la prueba**

Crear `.env` en la raíz del proyecto (no en `backend/`) con la URL real del webhook. El fichero ya está en `.gitignore`.

Run: `cd /home/juan/Documentos/Desarrollo/listadomanga && docker compose up -d backend && docker compose exec backend npm run notify:test`
Expected: `Mensaje de prueba enviado (id ...)`. En el canal aparecen dos tarjetas: una ámbar con miniatura y fecha prevista, otra verde con portada grande y `⭐ En tu wishlist` en el pie.

- [ ] **Step 4: Documentar en el `README.md`**

Añadir al final una sección:

```markdown
## Notificaciones a Discord

Cuando el scraper detecta novedades en las series que sigues o en las de tu
wishlist, se envía un aviso al canal de Discord configurado:

- 📢 **Nuevo tomo anunciado** — aparece un tomo que aún no está publicado.
- 🛒 **Ya a la venta** — un tomo publicado que no tienes comprado.

Se dispara tras la actualización diaria de las 07:00, tras "refrescar todo" y
tras refrescar una serie suelta. Cada tomo se avisa una sola vez: la tabla
`notified_volumes` guarda lo ya enviado.

### Configuración

Copia `.env.example` a `.env` y rellena la URL del webhook (Ajustes del canal →
Integraciones → Webhooks). El fichero `.env` está en `.gitignore`: la URL no
debe acabar en el repositorio, porque cualquiera que la tenga puede publicar en
el canal.

| Variable | Por defecto | Descripción |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | — | Sin ella, las notificaciones quedan desactivadas |
| `DISCORD_SEND_DELAY_MS` | `1500` | Pausa entre mensajes |
| `DISCORD_MAX_EMBEDS_PER_RUN` | `30` | Tope de tarjetas por ejecución |

Para comprobar el formato sin esperar a que haya novedades:

```bash
docker compose exec backend npm run notify:test
```

### Primer arranque

La primera vez que arranca con la tabla creada, todos los tomos existentes se
marcan como ya avisados, así que no recibirás nada de golpe. A partir de ahí
solo llegan las novedades reales.
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/scripts/notify-test.js backend/package.json README.md
git commit -m "feat(notif): script de prueba manual y documentación"
```

---

## Verificación final

- [ ] `cd backend && npm test` — toda la suite en verde (30 tests).
- [ ] `git check-ignore -v .env` — confirma que el secreto está fuera de git.
- [ ] `git log --oneline` — 7 commits, ninguno con la URL del webhook.
- [ ] `docker compose logs backend | grep NOTIF` — la línea base se creó una sola vez.
- [ ] Marcar un tomo publicado como no comprado en la app, lanzar
      `docker compose exec backend node -e "import('./src/services/notifications/index.js').then(m => m.notifyNewReleases())"`
      y comprobar que llega la tarjeta 🛒 al canal.
