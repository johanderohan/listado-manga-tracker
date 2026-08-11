# Resumen semanal del calendario — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar cada domingo a las 19:00 un único mensaje a Discord con las series que empiezan y los números únicos que salen la semana siguiente, leyendo el calendario público de listadomanga.es en directo.

**Architecture:** Cinco módulos puros o casi puros en `backend/src/services/calendar/`: helpers de fechas, parseo del HTML, descarga, construcción del resumen y orquestación. El parseo se prueba contra un fixture guardado, sin red y sin reloj. Se reutiliza el cliente de Discord ya existente y la tabla `app_config` para no duplicar envíos.

**Tech Stack:** Node 20 (ESM), cheerio 1.0 (ya es dependencia del scraper), `fetch` nativo, runner `node --test`, better-sqlite3 para `app_config`.

**Spec:** `docs/superpowers/specs/2026-08-11-resumen-semanal-calendario-design.md`

## Global Constraints

- **Sin dependencias nuevas.** cheerio y better-sqlite3 ya están en `backend/package.json`; el runner de tests es `node --test`.
- **ESM en todo el backend** (`"type": "module"`).
- **Ninguna variable de entorno nueva**: se reutiliza `DISCORD_WEBHOOK_URL`. Sin ella, el planificador no se registra y nada se envía.
- **Nada se guarda en la BD** salvo la clave `last_weekly_digest` en `app_config`. No se crean tablas.
- **Nada de tráfico entrante.** Dos peticiones salientes a listadomanga.es y una a Discord.
- **Color del embed**: `0x6366F1` (`6514417`), índigo. Distinto del ámbar `0xF59E0B` de los anuncios y del verde `0x22C55E` de los tomos a la venta.
- **Envío**: domingos a las 19:00 hora local. El contenedor ya fija `TZ=Europe/Madrid`.
- **Ventana**: lunes a domingo de la semana siguiente, ambos incluidos.
- **Límites de Discord**: 1024 caracteres por bloque, 6000 por embed. Títulos recortados a 60 caracteres; el bloque se corta por presupuesto de caracteres y, como mucho, a 15 líneas.
- **Textos en español**; comentarios en español explicando el porqué, siguiendo el estilo del código existente.
- **Rama de trabajo:** `feat/resumen-semanal-calendario`.

## Estructura de ficheros

**Se crean:**

| Fichero | Responsabilidad |
|---|---|
| `backend/src/services/calendar/week.js` | Aritmética de fechas: qué semana se anuncia, qué meses pedir, cómo se escriben las fechas. Puro |
| `backend/src/services/calendar/parser.js` | HTML del calendario → entradas estructuradas. Puro |
| `backend/src/services/calendar/client.js` | Descarga de `calendario.php`. Lo único que toca la red |
| `backend/src/services/calendar/digest.js` | Filtros, ventana, orden y construcción del embed. Puro |
| `backend/src/services/calendar/index.js` | Orquestación, estado en `app_config` y envío |
| `backend/test/fixtures/calendario-agosto.html` | Recorte real del calendario para los tests del parser |
| `backend/test/fixtures/calendario-septiembre.html` | Segundo mes, para la semana a caballo |
| `backend/test/week.test.js` | Tests de fechas |
| `backend/test/calendar-parser.test.js` | Tests de parseo |
| `backend/test/calendar-digest.test.js` | Tests de filtros y embed |
| `backend/test/calendar-digest-send.test.js` | Tests de orquestación |

**Se modifican:**

| Fichero | Cambio |
|---|---|
| `backend/src/services/cron.js` | Registrar el planificador semanal y la recuperación al arrancar |
| `README.md` | Sección del resumen semanal |

---

### Task 1: Aritmética de fechas

**Files:**
- Create: `backend/src/services/calendar/week.js`
- Create: `backend/test/week.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `announcedWeek(now: Date): { start: Date, end: Date, startIso: string, endIso: string }`
  - `monthsForWindow(window): Array<{ mes: number, ano: number }>` — uno o dos elementos
  - `formatRange(window): string` — `"del 10 al 16 de agosto"`
  - `formatShortDay(iso: string): string` — `"vie 14"`
  - `msUntilNextSunday(now: Date, hour: number): number`
  - `isCatchUpWindow(now: Date): boolean`
  - `toIso(date: Date): string` — `YYYY-MM-DD` en hora local

- [ ] **Step 1: Escribir el test que falla `backend/test/week.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  announcedWeek, monthsForWindow, formatRange, formatShortDay,
  msUntilNextSunday, isCatchUpWindow, toIso
} from '../src/services/calendar/week.js';

// 2026-08-09 es domingo; 2026-08-10, lunes.
const DOMINGO = new Date(2026, 7, 9, 19, 0, 0);
const LUNES = new Date(2026, 7, 10, 9, 0, 0);
const MIERCOLES = new Date(2026, 7, 12, 9, 0, 0);

test('el domingo se anuncia la semana que empieza mañana', () => {
  const w = announcedWeek(DOMINGO);
  assert.equal(w.startIso, '2026-08-10');
  assert.equal(w.endIso, '2026-08-16');
});

test('el lunes se anuncia la semana que empieza hoy', () => {
  assert.equal(announcedWeek(LUNES).startIso, '2026-08-10');
});

test('el resto de días se anuncia el lunes siguiente', () => {
  assert.equal(announcedWeek(MIERCOLES).startIso, '2026-08-17');
});

test('una semana dentro de un mes pide un solo mes', () => {
  assert.deepEqual(monthsForWindow(announcedWeek(DOMINGO)), [{ mes: 8, ano: 2026 }]);
});

test('una semana a caballo de dos meses pide los dos', () => {
  // 2026-08-30 es domingo: la semana va del 31 de agosto al 6 de septiembre.
  const w = announcedWeek(new Date(2026, 7, 30, 19, 0, 0));
  assert.equal(w.startIso, '2026-08-31');
  assert.equal(w.endIso, '2026-09-06');
  assert.deepEqual(monthsForWindow(w), [{ mes: 8, ano: 2026 }, { mes: 9, ano: 2026 }]);
});

test('una semana a caballo de dos años pide los dos', () => {
  // 2026-12-27 es domingo: semana del 28 de diciembre al 3 de enero.
  const w = announcedWeek(new Date(2026, 11, 27, 19, 0, 0));
  assert.deepEqual(monthsForWindow(w), [{ mes: 12, ano: 2026 }, { mes: 1, ano: 2027 }]);
});

test('el rango se escribe en español, con un solo mes o con dos', () => {
  assert.equal(formatRange(announcedWeek(DOMINGO)), 'del 10 al 16 de agosto');
  assert.equal(
    formatRange(announcedWeek(new Date(2026, 7, 30, 19, 0, 0))),
    'del 31 de agosto al 6 de septiembre'
  );
});

test('el día corto lleva abreviatura y número', () => {
  assert.equal(formatShortDay('2026-08-14'), 'vie 14');
  assert.equal(formatShortDay('2026-08-12'), 'mié 12');
});

test('toIso usa la fecha local, no UTC', () => {
  assert.equal(toIso(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});

test('msUntilNextSunday apunta al domingo siguiente a la hora dada', () => {
  // Miércoles 12 → domingo 16 a las 19:00.
  const ms = msUntilNextSunday(MIERCOLES, 19);
  const destino = new Date(MIERCOLES.getTime() + ms);
  assert.equal(destino.getDay(), 0);
  assert.equal(destino.getHours(), 19);
  assert.equal(toIso(destino), '2026-08-16');
});

test('si ya pasó la hora del domingo, salta al domingo siguiente', () => {
  const domingoTarde = new Date(2026, 7, 9, 20, 0, 0);
  const destino = new Date(domingoTarde.getTime() + msUntilNextSunday(domingoTarde, 19));
  assert.equal(toIso(destino), '2026-08-16');
});

test('la ventana de recuperación cubre del domingo por la tarde al lunes', () => {
  assert.equal(isCatchUpWindow(new Date(2026, 7, 9, 19, 30)), true);
  assert.equal(isCatchUpWindow(LUNES), true);
  assert.equal(isCatchUpWindow(new Date(2026, 7, 9, 12, 0)), false);
  assert.equal(isCatchUpWindow(MIERCOLES), false);
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module .../services/calendar/week.js`.

- [ ] **Step 3: Crear `backend/src/services/calendar/week.js`**

```js
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function toIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// La semana que toca anunciar. El domingo (día de envío) es la que empieza
// mañana; el lunes es la que empieza hoy, para que la recuperación tras un
// reinicio siga hablando de la misma semana.
export function announcedWeek(now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const dow = start.getDay(); // 0 = domingo, 1 = lunes
  start.setDate(start.getDate() + (dow === 1 ? 0 : (8 - dow) % 7));

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end, startIso: toIso(start), endIso: toIso(end) };
}

// calendario.php es mensual: una semana a caballo del cambio de mes obliga a
// pedir las dos páginas.
export function monthsForWindow({ start, end }) {
  const meses = [{ mes: start.getMonth() + 1, ano: start.getFullYear() }];
  if (start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear()) {
    meses.push({ mes: end.getMonth() + 1, ano: end.getFullYear() });
  }
  return meses;
}

export function formatRange({ start, end }) {
  const mesInicio = MESES[start.getMonth()];
  const mesFin = MESES[end.getMonth()];

  if (mesInicio === mesFin) {
    return `del ${start.getDate()} al ${end.getDate()} de ${mesFin}`;
  }
  return `del ${start.getDate()} de ${mesInicio} al ${end.getDate()} de ${mesFin}`;
}

export function formatShortDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DIAS_CORTOS[date.getDay()]} ${date.getDate()}`;
}

export function msUntilNextSunday(now, hour) {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);

  let dias = (7 - next.getDay()) % 7;
  if (dias === 0 && next <= now) dias = 7;
  next.setDate(next.getDate() + dias);

  return next.getTime() - now.getTime();
}

// Si el NAS estaba apagado el domingo a las 19:00, el resumen sale al arrancar
// mientras siga siendo la misma semana. Pasado el lunes ya no compensa.
export function isCatchUpWindow(now) {
  const dow = now.getDay();
  if (dow === 0) return now.getHours() >= 19;
  return dow === 1;
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `cd backend && npm test`
Expected: PASS — 12 tests de `week.test.js`, más los 30 que ya existían.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/calendar/week.js backend/test/week.test.js
git commit -m "feat(calendario): aritmética de la semana a anunciar"
```

---

### Task 2: Parseo del calendario

**Files:**
- Create: `backend/test/fixtures/calendario-agosto.html`
- Create: `backend/test/fixtures/calendario-septiembre.html`
- Create: `backend/src/services/calendar/parser.js`
- Create: `backend/test/calendar-parser.test.js`

**Interfaces:**
- Consumes: nada del proyecto; cheerio.
- Produces:
  - `parseCalendar(html: string): { entries: Entry[], totalEntries: number }`
  - `Entry = { seriesId, titulo, tipo: 'nuevaSerie'|'unico', fecha: string, editorial, categoria, autores: string[], portadaUrl: string|null, url: string }`
  - `totalEntries` cuenta **todas** las líneas de tomo, marcadas o no: sirve para distinguir un mes flojo de un parseo roto.

- [ ] **Step 1: Crear el fixture `backend/test/fixtures/calendario-agosto.html`**

Reproduce la estructura real de `calendario.php` con los casos que hay que
distinguir: dos bloques editorial+fecha, la rejilla de portadas, una categoría
normal y una de figuras, y las entradas marcadas, sin marcar, con `Pack` y con
sobrecubierta alternativa.

```html
<html><head><title>Listado Manga &middot; Calendario &middot; Agosto 2026</title></head><body>

<table><tr><td class="cen"><h2><a href="calendario.php?editorial=3">Norma Editorial</a></h2><div style="height: 8px;"> </div><h2>Viernes, 14 Agosto 2026</h2></td></tr></table>

<table><tr>
<td><table class="ventana_id1"><tr><td class="cen"><a href="coleccion.php?id=6444"><img class="portada" src="https://static.listadomanga.com/daidark.jpg" alt="Dai Dark n&ordm;1"/></a></td></tr></table></td>
<td><table class="ventana_id1"><tr><td class="cen"><a href="coleccion.php?id=4597"><img class="portada" src="https://static.listadomanga.com/aoashi.jpg" alt="Ao Ashi n&ordm;38"/></a></td></tr></table></td>
<td><table class="ventana_id1"><tr><td class="cen"><a href="coleccion.php?id=7001"><img class="portada" src="https://static.listadomanga.com/guia.jpg" alt="Gu&iacute;a Final"/></a></td></tr></table></td>
</tr></table>

<table><tr><td><table class="ventana_id1"><tr><td class="izq">
<b><u>Seinen</u></b><br/>
- <a href="coleccion.php?id=6444">Dai Dark (Norma) n&ordm;1 (de 9 y abierta)</a> / <a href="autor.php?id=1843">Q-Hayashida</a> <span class="nuevacoleccion">NOVEDAD</span><br/>
- <a href="coleccion.php?id=4597">Ao Ashi n&ordm;38 (de 40)</a> / <a href="autor.php?id=3100">Y&ucirc;go Kobayashi</a><br/>
<br/>
<b><u>Shonen</u></b><br/>
- <a href="coleccion.php?id=7001">Ataque a los Titanes: Gu&iacute;a Final (Edici&oacute;n Coleccionista)</a> / <a href="autor.php?id=11">Hajime Isayama</a> <span class="tomounico">N&Uacute;MERO &Uacute;NICO</span><br/>
</td></tr></table></td></tr></table>

<table><tr><td class="cen"><h2><a href="calendario.php?editorial=4">Planeta DeAgostini</a></h2><div style="height: 8px;"> </div><h2>Martes, 18 Agosto 2026</h2></td></tr></table>

<table><tr><td><table class="ventana_id1"><tr><td class="izq">
<b><u>Miniaturas y figuras</u></b><br/>
- <a href="coleccion.php?id=8000">My Hero Academia: La colecci&oacute;n de figuras oficial n&ordm;1 (de 84)</a> / <a href="autor.php?id=99">K&ocirc;hei Horikoshi</a> <span class="nuevacoleccion">NOVEDAD</span><br/>
<br/>
<b><u>Power Line</u></b><br/>
- <a href="coleccion.php?id=8100">Hisoka Returns! - Pack tomos 1 y 2</a> / <a href="autor.php?id=77">Autor Ejemplo</a> <span class="tomounico">N&Uacute;MERO &Uacute;NICO</span><br/>
- <a href="coleccion.php?id=8101">Horobi (MangaLine) - Sobrecubierta Alternativa</a> / <a href="autor.php?id=78">Otro Autor</a> <span class="tomounico">N&Uacute;MERO &Uacute;NICO</span><br/>
- <a href="coleccion.php?id=8102">86 -Eighty-Six- n&ordm;1 (de 14 y abierta)</a> / <a href="autor.php?id=79">Asato Asato</a>, <a href="autor.php?id=80">Shirabii</a> <span class="nuevacoleccion">NOVEDAD</span><br/>
</td></tr></table></td></tr></table>

</body></html>
```

- [ ] **Step 2: Crear el fixture `backend/test/fixtures/calendario-septiembre.html`**

Un solo bloque, para comprobar que la semana a caballo combina dos meses.

```html
<html><head><title>Listado Manga &middot; Calendario &middot; Septiembre 2026</title></head><body>

<table><tr><td class="cen"><h2><a href="calendario.php?editorial=9">Milky Way Ediciones</a></h2><div style="height: 8px;"> </div><h2>Jueves, 3 Septiembre 2026</h2></td></tr></table>

<table><tr><td><table class="ventana_id1"><tr><td class="cen"><a href="coleccion.php?id=9001"><img class="portada" src="https://static.listadomanga.com/dogsred.jpg" alt="Dogsred n&ordm;1"/></a></td></tr></table></td></tr></table>

<table><tr><td><table class="ventana_id1"><tr><td class="izq">
<b><u>Seinen</u></b><br/>
- <a href="coleccion.php?id=9001">Dogsred n&ordm;1 (de 8 y abierta)</a> / <a href="autor.php?id=500">Satoru Noda</a> <span class="nuevacoleccion">NOVEDAD</span><br/>
</td></tr></table></td></tr></table>

</body></html>
```

- [ ] **Step 3: Escribir el test que falla `backend/test/calendar-parser.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCalendar } from '../src/services/calendar/parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const agosto = readFileSync(join(here, 'fixtures/calendario-agosto.html'), 'utf-8');
const septiembre = readFileSync(join(here, 'fixtures/calendario-septiembre.html'), 'utf-8');

test('solo salen las entradas marcadas, y el total las cuenta todas', () => {
  const { entries, totalEntries } = parseCalendar(agosto);

  assert.equal(totalEntries, 7);
  assert.equal(entries.length, 6); // Ao Ashi nº38 no está marcada
  assert.ok(!entries.some(e => e.titulo.includes('Ao Ashi')));
});

test('NOVEDAD es nuevaSerie y NÚMERO ÚNICO es unico', () => {
  const { entries } = parseCalendar(agosto);
  const daiDark = entries.find(e => e.titulo.startsWith('Dai Dark'));
  const guia = entries.find(e => e.titulo.startsWith('Ataque a los Titanes'));

  assert.equal(daiDark.tipo, 'nuevaSerie');
  assert.equal(guia.tipo, 'unico');
});

test('cada entrada hereda editorial, fecha y categoría de su bloque', () => {
  const { entries } = parseCalendar(agosto);
  const daiDark = entries.find(e => e.titulo.startsWith('Dai Dark'));
  const figuras = entries.find(e => e.titulo.startsWith('My Hero Academia'));

  assert.equal(daiDark.editorial, 'Norma Editorial');
  assert.equal(daiDark.fecha, '2026-08-14');
  assert.equal(daiDark.categoria, 'Seinen');

  assert.equal(figuras.editorial, 'Planeta DeAgostini');
  assert.equal(figuras.fecha, '2026-08-18');
  assert.equal(figuras.categoria, 'Miniaturas y figuras');
});

test('las entidades HTML se decodifican en título y autores', () => {
  const { entries } = parseCalendar(agosto);
  const guia = entries.find(e => e.titulo.startsWith('Ataque'));

  assert.equal(guia.titulo, 'Ataque a los Titanes: Guía Final (Edición Coleccionista)');
  assert.deepEqual(guia.autores, ['Hajime Isayama']);
});

test('varios autores se recogen todos', () => {
  const { entries } = parseCalendar(agosto);
  const ochenta = entries.find(e => e.titulo.startsWith('86'));
  assert.deepEqual(ochenta.autores, ['Asato Asato', 'Shirabii']);
});

test('la portada se cruza por id de serie y falta sin romper', () => {
  const { entries } = parseCalendar(agosto);
  const daiDark = entries.find(e => e.titulo.startsWith('Dai Dark'));
  const sinPortada = entries.find(e => e.titulo.startsWith('86'));

  assert.equal(daiDark.portadaUrl, 'https://static.listadomanga.com/daidark.jpg');
  assert.equal(sinPortada.portadaUrl, null);
});

test('cada entrada trae su enlace absoluto a la ficha', () => {
  const { entries } = parseCalendar(agosto);
  const daiDark = entries.find(e => e.titulo.startsWith('Dai Dark'));

  assert.equal(daiDark.seriesId, 6444);
  assert.equal(daiDark.url, 'https://www.listadomanga.es/coleccion.php?id=6444');
});

test('un segundo mes se parsea igual', () => {
  const { entries, totalEntries } = parseCalendar(septiembre);

  assert.equal(totalEntries, 1);
  assert.equal(entries[0].fecha, '2026-09-03');
  assert.equal(entries[0].editorial, 'Milky Way Ediciones');
});

test('una página sin entradas devuelve vacío sin lanzar', () => {
  const { entries, totalEntries } = parseCalendar('<html><body><p>Vaya</p></body></html>');

  assert.deepEqual(entries, []);
  assert.equal(totalEntries, 0);
});
```

- [ ] **Step 4: Ejecutar los tests y verificar que fallan**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module .../services/calendar/parser.js`.

- [ ] **Step 5: Crear `backend/src/services/calendar/parser.js`**

```js
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.listadomanga.es';

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};

// 'Viernes, 14 Agosto 2026' → '2026-08-14'. Devuelve null si el h2 no es una
// fecha, que es como se distingue del h2 de la editorial.
function parseFecha(texto) {
  const m = texto.match(/(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(\d{4})/);
  if (!m) return null;

  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;

  return `${m[3]}-${String(mes).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

// Mapa id de serie → portada. Se construye de una pasada sobre toda la página:
// la rejilla de imágenes envuelve cada portada en un enlace a la ficha, así que
// el cruce es exacto sin depender del texto del alt.
function buildCoverMap($) {
  const covers = new Map();

  $('a[href^="coleccion.php?id="]').each((_, el) => {
    const img = $(el).find('img.portada').attr('src');
    if (!img) return;

    const id = Number($(el).attr('href').match(/id=(\d+)/)[1]);
    if (!covers.has(id)) covers.set(id, img);
  });

  return covers;
}

export function parseCalendar(html) {
  const $ = cheerio.load(html);
  const covers = buildCoverMap($);

  const entries = [];
  let totalEntries = 0;
  let editorial = '';
  let fecha = '';
  let categoria = '';

  // h2 y td.izq llegan en orden de documento, así que basta con ir arrastrando
  // la editorial, la fecha y la categoría vigentes.
  $('h2, td.izq').each((_, el) => {
    const $el = $(el);

    if ($el.is('h2')) {
      if ($el.find('a[href*="calendario.php?editorial="]').length > 0) {
        editorial = $el.text().trim();
        return;
      }
      const f = parseFecha($el.text().trim());
      if (f) fecha = f;
      return;
    }

    for (const trozo of $el.html().split(/<br\s*\/?>/i)) {
      const $t = cheerio.load(`<div>${trozo}</div>`);

      const cat = $t('b u').first().text().trim();
      if (cat) { categoria = cat; continue; }

      const $ficha = $t('a[href^="coleccion.php?id="]').first();
      if ($ficha.length === 0) continue;

      totalEntries++;

      const tipo = $t('span.nuevacoleccion').length > 0 ? 'nuevaSerie'
        : $t('span.tomounico').length > 0 ? 'unico'
        : null;
      if (!tipo) continue;

      const seriesId = Number($ficha.attr('href').match(/id=(\d+)/)[1]);

      entries.push({
        seriesId,
        titulo: $ficha.text().trim(),
        tipo,
        fecha,
        editorial,
        categoria,
        autores: $t('a[href^="autor.php"]').map((_, a) => $t(a).text().trim()).get(),
        portadaUrl: covers.get(seriesId) || null,
        url: `${BASE_URL}/coleccion.php?id=${seriesId}`
      });
    }
  });

  return { entries, totalEntries };
}
```

- [ ] **Step 6: Ejecutar los tests y verificar que pasan**

Run: `cd backend && npm test`
Expected: PASS — 9 tests de `calendar-parser.test.js`.

- [ ] **Step 7: Comprobar el parser contra la página real**

Un fixture puede quedarse desfasado; esta comprobación confirma que el parseo
funciona con el HTML de verdad, hoy.

Run:
```bash
cd backend && node -e "
import('./src/services/calendar/parser.js').then(async ({ parseCalendar }) => {
  const html = await fetch('https://www.listadomanga.es/calendario.php').then(r => r.text());
  const { entries, totalEntries } = parseCalendar(html);
  console.log('total entradas:', totalEntries);
  console.log('marcadas:', entries.length);
  console.log('nuevaSerie:', entries.filter(e => e.tipo === 'nuevaSerie').length);
  console.log('unico:', entries.filter(e => e.tipo === 'unico').length);
  console.log('sin fecha:', entries.filter(e => !e.fecha).length);
  console.log('sin editorial:', entries.filter(e => !e.editorial).length);
  console.log('con portada:', entries.filter(e => e.portadaUrl).length);
  console.log(entries[0]);
});"
```

Expected: unas 100-200 entradas totales, entre 15 y 35 marcadas, **cero sin
fecha y cero sin editorial**, y la mayoría con portada. Si algo sale a cero
donde no debe, el parseo está mal y hay que arreglarlo antes de seguir.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/calendar/parser.js backend/test/calendar-parser.test.js backend/test/fixtures/
git commit -m "feat(calendario): parseo de calendario.php"
```

---

### Task 3: Filtros y construcción del resumen

**Files:**
- Create: `backend/src/services/calendar/digest.js`
- Create: `backend/test/calendar-digest.test.js`

**Interfaces:**
- Consumes: `Entry` de `parser.js`; `formatRange`, `formatShortDay` de `week.js`.
- Produces:
  - `COLOR_DIGEST: 6514417`
  - `MAX_LINEAS_POR_BLOQUE: 15`, `MAX_CARACTERES_BLOQUE: 1024`, `MAX_TITULO: 60`
  - `filtrarRelevantes(entries: Entry[]): Entry[]`
  - `enVentana(entries: Entry[], window): Entry[]`
  - `buildDigestEmbed({ entries, window, now }): object`

- [ ] **Step 1: Escribir el test que falla `backend/test/calendar-digest.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrarRelevantes, enVentana, buildDigestEmbed, COLOR_DIGEST } from '../src/services/calendar/digest.js';
import { announcedWeek } from '../src/services/calendar/week.js';

const VENTANA = announcedWeek(new Date(2026, 7, 9, 19, 0, 0)); // 10 → 16 agosto
const NOW = new Date(2026, 7, 9, 19, 0, 0);

function entrada(extra = {}) {
  return {
    seriesId: 1,
    titulo: 'Dai Dark',
    tipo: 'nuevaSerie',
    fecha: '2026-08-14',
    editorial: 'Norma Editorial',
    categoria: 'Seinen',
    autores: ['Q-Hayashida'],
    portadaUrl: 'https://static.listadomanga.com/daidark.jpg',
    url: 'https://www.listadomanga.es/coleccion.php?id=1',
    ...extra
  };
}

test('se descartan las miniaturas y figuras', () => {
  const out = filtrarRelevantes([
    entrada(),
    entrada({ titulo: 'Figuras oficiales nº1', categoria: 'Miniaturas y figuras' })
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].titulo, 'Dai Dark');
});

test('se descartan packs y sobrecubiertas alternativas', () => {
  const out = filtrarRelevantes([
    entrada(),
    entrada({ titulo: 'Hisoka Returns! - Pack tomos 1 y 2' }),
    entrada({ titulo: 'Horobi (MangaLine) - Sobrecubierta Alternativa' }),
    entrada({ titulo: 'Bajo el cielo azul (Pack Keiko Nagita)' })
  ]);
  assert.deepEqual(out.map(e => e.titulo), ['Dai Dark']);
});

test('no se descartan novelas ligeras ni ensayos', () => {
  const out = filtrarRelevantes([
    entrada({ titulo: '86 -Eighty-Six-', categoria: 'Novelas Ligeras' }),
    entrada({ titulo: 'Mazinger Z: El legado', categoria: 'Ensayo' })
  ]);
  assert.equal(out.length, 2);
});

test('el filtro de Pack no se lleva por delante palabras que lo contienen', () => {
  const out = filtrarRelevantes([entrada({ titulo: 'Packard Historias' })]);
  assert.equal(out.length, 1);
});

test('la ventana excluye lo anterior y lo posterior', () => {
  const out = enVentana([
    entrada({ fecha: '2026-08-09' }),
    entrada({ fecha: '2026-08-10' }),
    entrada({ fecha: '2026-08-16' }),
    entrada({ fecha: '2026-08-17' })
  ], VENTANA);
  assert.deepEqual(out.map(e => e.fecha), ['2026-08-10', '2026-08-16']);
});

test('el embed agrupa por tipo, cuenta y ordena por fecha y título', () => {
  const embed = buildDigestEmbed({
    entries: [
      entrada({ titulo: 'Zeta', fecha: '2026-08-14' }),
      entrada({ titulo: 'Alfa', fecha: '2026-08-14' }),
      entrada({ titulo: 'Dogsred', fecha: '2026-08-12' }),
      entrada({ titulo: 'Único', tipo: 'unico', fecha: '2026-08-13' })
    ],
    window: VENTANA,
    now: NOW
  });

  assert.equal(embed.color, COLOR_DIGEST);
  assert.equal(embed.title, '🗓️ Salidas del 10 al 16 de agosto');

  const [series, unicos] = embed.fields;
  assert.equal(series.name, '📘 Empiezan serie (3)');
  assert.match(series.value.split('\n')[0], /Dogsred.*mié 12/);
  assert.match(series.value.split('\n')[1], /Alfa.*vie 14/);
  assert.match(series.value.split('\n')[2], /Zeta.*vie 14/);
  assert.equal(unicos.name, '📗 Números únicos (1)');
  assert.equal(embed.footer.text, '4 novedades · listadomanga.es');
});

test('la línea lleva enlace, editorial y día corto', () => {
  const embed = buildDigestEmbed({ entries: [entrada()], window: VENTANA, now: NOW });
  assert.equal(
    embed.fields[0].value,
    '• [Dai Dark](https://www.listadomanga.es/coleccion.php?id=1) · Norma Editorial · vie 14'
  );
});

test('un bloque vacío no aparece', () => {
  const embed = buildDigestEmbed({
    entries: [entrada({ tipo: 'unico' })],
    window: VENTANA,
    now: NOW
  });
  assert.equal(embed.fields.length, 1);
  assert.equal(embed.fields[0].name, '📗 Números únicos (1)');
});

test('la miniatura sale de la primera serie nueva', () => {
  const embed = buildDigestEmbed({
    entries: [
      entrada({ titulo: 'Tardía', fecha: '2026-08-15', portadaUrl: 'https://x/tardia.jpg' }),
      entrada({ titulo: 'Pronta', fecha: '2026-08-11', portadaUrl: 'https://x/pronta.jpg' })
    ],
    window: VENTANA,
    now: NOW
  });
  assert.equal(embed.thumbnail.url, 'https://x/pronta.jpg');
});

test('sin series nuevas, la miniatura sale del primer único; sin portada, no hay miniatura', () => {
  const conUnico = buildDigestEmbed({
    entries: [entrada({ tipo: 'unico', portadaUrl: 'https://x/u.jpg' })],
    window: VENTANA, now: NOW
  });
  assert.equal(conUnico.thumbnail.url, 'https://x/u.jpg');

  const sinPortada = buildDigestEmbed({
    entries: [entrada({ portadaUrl: null })],
    window: VENTANA, now: NOW
  });
  assert.equal(sinPortada.thumbnail, undefined);
});

test('semana vacía: texto corto y sin bloques', () => {
  const embed = buildDigestEmbed({ entries: [], window: VENTANA, now: NOW });

  assert.equal(embed.title, '🗓️ Sin nuevas series ni números únicos del 10 al 16 de agosto');
  assert.deepEqual(embed.fields, []);
  assert.equal(embed.thumbnail, undefined);
});

test('un bloque largo se recorta, cuenta el resto y respeta el límite de Discord', () => {
  const muchas = Array.from({ length: 20 }, (_, i) =>
    entrada({ titulo: `Serie ${String(i).padStart(2, '0')}`, seriesId: i })
  );
  const embed = buildDigestEmbed({ entries: muchas, window: VENTANA, now: NOW });
  const lineas = embed.fields[0].value.split('\n');
  const mostradas = lineas.length - 1;

  assert.ok(embed.fields[0].value.length <= 1024);
  assert.ok(mostradas > 0 && mostradas <= 15);
  assert.equal(lineas.at(-1), `…y ${20 - mostradas} más`);
  assert.equal(embed.fields[0].name, '📘 Empiezan serie (20)');
});

test('con títulos al máximo caben menos líneas, pero nunca se pasa de 1024', () => {
  const largas = Array.from({ length: 20 }, (_, i) =>
    entrada({ titulo: `${'B'.repeat(60)} ${i}`, seriesId: i })
  );
  const embed = buildDigestEmbed({ entries: largas, window: VENTANA, now: NOW });

  assert.ok(embed.fields[0].value.length <= 1024);
  assert.match(embed.fields[0].value.split('\n').at(-1), /^…y \d+ más$/);
});

test('un título larguísimo se recorta a 60 caracteres', () => {
  const largo = 'A'.repeat(90);
  const embed = buildDigestEmbed({ entries: [entrada({ titulo: largo })], window: VENTANA, now: NOW });

  assert.match(embed.fields[0].value, /A{59}…/);
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module .../services/calendar/digest.js`.

- [ ] **Step 3: Crear `backend/src/services/calendar/digest.js`**

```js
import { formatRange, formatShortDay } from './week.js';

// Índigo: distinto del ámbar de los anuncios y del verde de los tomos a la
// venta, para diferenciar los tres avisos de un vistazo.
export const COLOR_DIGEST = 0x6366f1;

// Discord corta el bloque a 1024 caracteres. Con enlaces markdown cada línea
// ronda los 90, así que el límite real lo marca el presupuesto de caracteres,
// no el número de líneas: 15 líneas se pasarían de largo.
export const MAX_LINEAS_POR_BLOQUE = 15;
export const MAX_CARACTERES_BLOQUE = 1024;
export const MAX_TITULO = 60;

// Sitio reservado para la línea de cierre '…y N más'.
const RESERVA_CIERRE = 20;

// Coleccionables por fascículos: cada colección que arranca genera un nº1 que
// no es manga.
const CATEGORIAS_FUERA = /miniaturas|figuras/i;

// Duplican algo que ya se lista por su cuenta.
const TITULOS_FUERA = /\bpack\b|sobrecubierta\s+alternativa/i;

export function filtrarRelevantes(entries) {
  return entries.filter(e =>
    !CATEGORIAS_FUERA.test(e.categoria || '') && !TITULOS_FUERA.test(e.titulo || '')
  );
}

export function enVentana(entries, { startIso, endIso }) {
  return entries.filter(e => e.fecha >= startIso && e.fecha <= endIso);
}

function ordenar(entries) {
  return [...entries].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo, 'es')
  );
}

function recortar(titulo) {
  return titulo.length > MAX_TITULO ? `${titulo.slice(0, MAX_TITULO - 1)}…` : titulo;
}

function bloque(nombre, entries) {
  if (entries.length === 0) return null;

  const lineas = [];
  let largo = 0;

  for (const e of entries) {
    if (lineas.length === MAX_LINEAS_POR_BLOQUE) break;

    const linea = `• [${recortar(e.titulo)}](${e.url}) · ${e.editorial} · ${formatShortDay(e.fecha)}`;
    if (largo + linea.length + 1 > MAX_CARACTERES_BLOQUE - RESERVA_CIERRE) break;

    lineas.push(linea);
    largo += linea.length + 1;
  }

  const restantes = entries.length - lineas.length;
  if (restantes > 0) lineas.push(`…y ${restantes} más`);

  return { name: `${nombre} (${entries.length})`, value: lineas.join('\n'), inline: false };
}

export function buildDigestEmbed({ entries, window, now = new Date() }) {
  const rango = formatRange(window);

  if (entries.length === 0) {
    return {
      title: `🗓️ Sin nuevas series ni números únicos ${rango}`,
      color: COLOR_DIGEST,
      fields: [],
      timestamp: now.toISOString()
    };
  }

  const series = ordenar(entries.filter(e => e.tipo === 'nuevaSerie'));
  const unicos = ordenar(entries.filter(e => e.tipo === 'unico'));

  const embed = {
    title: `🗓️ Salidas ${rango}`,
    url: 'https://www.listadomanga.es/calendario.php',
    color: COLOR_DIGEST,
    fields: [bloque('📘 Empiezan serie', series), bloque('📗 Números únicos', unicos)].filter(Boolean),
    footer: { text: `${entries.length} novedades · listadomanga.es` },
    timestamp: now.toISOString()
  };

  const portada = [...series, ...unicos].find(e => e.portadaUrl)?.portadaUrl;
  if (portada) embed.thumbnail = { url: portada };

  return embed;
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `cd backend && npm test`
Expected: PASS — 14 tests de `calendar-digest.test.js`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/calendar/digest.js backend/test/calendar-digest.test.js
git commit -m "feat(calendario): filtros y embed del resumen semanal"
```

---

### Task 4: Descarga y orquestación

**Files:**
- Create: `backend/src/services/calendar/client.js`
- Create: `backend/src/services/calendar/index.js`
- Create: `backend/test/calendar-digest-send.test.js`

**Interfaces:**
- Consumes: `parseCalendar` (Task 2); `filtrarRelevantes`, `enVentana`, `buildDigestEmbed` (Task 3); `announcedWeek`, `monthsForWindow` (Task 1); `sendMessage` de `../notifications/discord.js`.
- Produces:
  - `fetchMonth({ mes, ano }, { fetchImpl }): Promise<string>`
  - `sendWeeklyDigest({ database, now, webhookUrl, fetchImpl, sendImpl }): Promise<{ sent: boolean, count: number, skipped?: string }>`
  - Valores de `skipped`: `'sin-webhook'`, `'ya-enviado'`, `'parseo-vacio'`, `'error-descarga'`, `'error-envio'`

- [ ] **Step 1: Escribir el test que falla `backend/test/calendar-digest-send.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeTestDb } from './helpers/db.js';
import { sendWeeklyDigest } from '../src/services/calendar/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const agosto = readFileSync(join(here, 'fixtures/calendario-agosto.html'), 'utf-8');
const septiembre = readFileSync(join(here, 'fixtures/calendario-septiembre.html'), 'utf-8');

const WEBHOOK = 'https://discord.test/webhooks/1/token';
const DOMINGO = new Date(2026, 7, 9, 19, 0, 0);   // semana del 10 al 16 de agosto
const DOMINGO_FIN = new Date(2026, 7, 30, 19, 0, 0); // semana del 31 ago al 6 sep

// Devuelve el HTML del mes pedido en la URL.
function fakeFetch(porMes) {
  return async (url) => {
    const mes = Number(new URL(url).searchParams.get('mes'));
    return { ok: true, status: 200, text: async () => porMes[mes] ?? '<html></html>' };
  };
}

function marca(db) {
  return db.prepare("SELECT value FROM app_config WHERE key = 'last_weekly_digest'").get()?.value;
}

test('sin webhook no hace nada', async () => {
  const db = makeTestDb();
  const r = await sendWeeklyDigest({ database: db, now: DOMINGO, webhookUrl: '' });

  assert.equal(r.sent, false);
  assert.equal(r.skipped, 'sin-webhook');
});

test('envía el resumen de la semana y guarda la marca', async () => {
  const db = makeTestDb();
  const enviados = [];

  const r = await sendWeeklyDigest({
    database: db,
    now: DOMINGO,
    webhookUrl: WEBHOOK,
    fetchImpl: fakeFetch({ 8: agosto }),
    sendImpl: async ({ embeds }) => { enviados.push(embeds); return 'id'; }
  });

  assert.equal(r.sent, true);
  // Del fixture de agosto, dentro del 10-16: Dai Dark y la Guía (día 14).
  // Las figuras, el pack y la sobrecubierta del día 18 quedan fuera por fecha
  // y por filtro.
  assert.equal(r.count, 2);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].length, 1);
  assert.equal(marca(db), '2026-08-10');
});

test('no reenvía si la marca de esa semana ya está', async () => {
  const db = makeTestDb();
  db.prepare("INSERT INTO app_config (key, value) VALUES ('last_weekly_digest', '2026-08-10')").run();
  let llamado = false;

  const r = await sendWeeklyDigest({
    database: db,
    now: DOMINGO,
    webhookUrl: WEBHOOK,
    fetchImpl: fakeFetch({ 8: agosto }),
    sendImpl: async () => { llamado = true; return 'id'; }
  });

  assert.equal(r.sent, false);
  assert.equal(r.skipped, 'ya-enviado');
  assert.equal(llamado, false);
});

test('la semana a caballo de dos meses combina las dos páginas', async () => {
  const db = makeTestDb();
  const pedidos = [];
  const enviados = [];

  const r = await sendWeeklyDigest({
    database: db,
    now: DOMINGO_FIN,
    webhookUrl: WEBHOOK,
    fetchImpl: async (url) => {
      const mes = Number(new URL(url).searchParams.get('mes'));
      pedidos.push(mes);
      return { ok: true, status: 200, text: async () => ({ 8: agosto, 9: septiembre })[mes] };
    },
    sendImpl: async ({ embeds }) => { enviados.push(embeds); return 'id'; }
  });

  assert.deepEqual(pedidos, [8, 9]);
  // Del 31 de agosto al 6 de septiembre solo cae Dogsred (3 de septiembre).
  assert.equal(r.count, 1);
  assert.match(enviados[0][0].fields[0].value, /Dogsred/);
});

test('una semana sin novedades manda el aviso corto y marca igual', async () => {
  const db = makeTestDb();
  const enviados = [];

  const r = await sendWeeklyDigest({
    database: db,
    // Semana del 24 al 30: el fixture solo tiene salidas el 14 y el 18. Ojo,
    // la semana del 17 al 23 no vale: contiene el 86 -Eighty-Six- del día 18,
    // que es novela ligera y por tanto no se filtra.
    now: new Date(2026, 7, 23, 19, 0, 0),
    webhookUrl: WEBHOOK,
    fetchImpl: fakeFetch({ 8: agosto }),
    sendImpl: async ({ embeds }) => { enviados.push(embeds); return 'id'; }
  });

  assert.equal(r.sent, true);
  assert.equal(r.count, 0);
  assert.match(enviados[0][0].title, /^🗓️ Sin nuevas series/);
  assert.equal(marca(db), '2026-08-24');
});

test('si el mes entero viene vacío, no envía y no marca', async () => {
  const db = makeTestDb();
  let llamado = false;

  const r = await sendWeeklyDigest({
    database: db,
    now: DOMINGO,
    webhookUrl: WEBHOOK,
    fetchImpl: fakeFetch({ 8: '<html><body>Web en mantenimiento</body></html>' }),
    sendImpl: async () => { llamado = true; return 'id'; }
  });

  assert.equal(r.sent, false);
  assert.equal(r.skipped, 'parseo-vacio');
  assert.equal(llamado, false);
  assert.equal(marca(db), undefined);
});

test('si falla la descarga, no marca', async () => {
  const db = makeTestDb();

  const r = await sendWeeklyDigest({
    database: db,
    now: DOMINGO,
    webhookUrl: WEBHOOK,
    fetchImpl: async () => { throw new Error('ECONNRESET'); },
    sendImpl: async () => 'id'
  });

  assert.equal(r.sent, false);
  assert.equal(r.skipped, 'error-descarga');
  assert.equal(marca(db), undefined);
});

test('si falla el envío, no marca', async () => {
  const db = makeTestDb();

  const r = await sendWeeklyDigest({
    database: db,
    now: DOMINGO,
    webhookUrl: WEBHOOK,
    fetchImpl: fakeFetch({ 8: agosto }),
    sendImpl: async () => { throw new Error('Discord caído'); }
  });

  assert.equal(r.sent, false);
  assert.equal(r.skipped, 'error-envio');
  assert.equal(marca(db), undefined);
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module .../services/calendar/index.js`.

- [ ] **Step 3: Crear `backend/src/services/calendar/client.js`**

```js
const BASE_URL = 'https://www.listadomanga.es';

// calendario.php muestra el mes en curso; con mes y ano se pide cualquier otro.
export async function fetchMonth({ mes, ano }, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${BASE_URL}/calendario.php?mes=${mes}&ano=${ano}`);
  if (!res.ok) throw new Error(`calendario.php respondió ${res.status}`);
  return res.text();
}
```

- [ ] **Step 4: Crear `backend/src/services/calendar/index.js`**

```js
import db from '../../config/db.js';
import { sendMessage } from '../notifications/discord.js';
import { announcedWeek, monthsForWindow } from './week.js';
import { fetchMonth } from './client.js';
import { parseCalendar } from './parser.js';
import { filtrarRelevantes, enVentana, buildDigestEmbed } from './digest.js';

const CLAVE = 'last_weekly_digest';

function leerMarca(database) {
  return database.prepare('SELECT value FROM app_config WHERE key = ?').get(CLAVE)?.value;
}

function guardarMarca(database, valor) {
  database.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run(CLAVE, valor);
}

export async function sendWeeklyDigest({
  database = db,
  now = new Date(),
  webhookUrl = process.env.DISCORD_WEBHOOK_URL,
  fetchImpl = fetch,
  sendImpl = sendMessage
} = {}) {
  if (!webhookUrl) return { sent: false, count: 0, skipped: 'sin-webhook' };

  const window = announcedWeek(now);
  if (leerMarca(database) === window.startIso) {
    return { sent: false, count: 0, skipped: 'ya-enviado' };
  }

  let entries = [];
  let totalEntries = 0;

  try {
    for (const mes of monthsForWindow(window)) {
      const html = await fetchMonth(mes, { fetchImpl });
      const parsed = parseCalendar(html);
      entries.push(...parsed.entries);
      totalEntries += parsed.totalEntries;
    }
  } catch (err) {
    console.error(`[SEMANAL] Fallo al descargar el calendario: ${err.message}`);
    return { sent: false, count: 0, skipped: 'error-descarga' };
  }

  // Cero entradas dentro de la ventana es una semana floja; cero entradas en
  // todo el mes es que el parseo se ha roto. Mandar "sin novedades" en el
  // segundo caso sería mentir.
  if (totalEntries === 0) {
    console.error('[SEMANAL] El calendario no devolvió ninguna entrada: revisar el parseo');
    return { sent: false, count: 0, skipped: 'parseo-vacio' };
  }

  const seleccion = enVentana(filtrarRelevantes(entries), window);

  try {
    await sendImpl({ embeds: [buildDigestEmbed({ entries: seleccion, window, now })] }, { webhookUrl });
  } catch (err) {
    console.error(`[SEMANAL] Fallo al enviar a Discord: ${err.message}`);
    return { sent: false, count: 0, skipped: 'error-envio' };
  }

  guardarMarca(database, window.startIso);
  console.log(`[SEMANAL] Resumen enviado: ${seleccion.length} novedades ${window.startIso} → ${window.endIso}`);

  return { sent: true, count: seleccion.length };
}
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `cd backend && npm test`
Expected: PASS — 8 tests de `calendar-digest-send.test.js`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/calendar/client.js backend/src/services/calendar/index.js backend/test/calendar-digest-send.test.js
git commit -m "feat(calendario): descarga y orquestación del resumen"
```

---

### Task 5: Planificador semanal y documentación

**Files:**
- Modify: `backend/src/services/cron.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: `sendWeeklyDigest` (Task 4); `msUntilNextSunday`, `isCatchUpWindow` (Task 1).
- Produces: nada nuevo; conecta el resumen al arranque de la aplicación.

- [ ] **Step 1: Añadir los imports en `backend/src/services/cron.js`**

Junto al import de `notifications/index.js` que ya existe:

```js
import { sendWeeklyDigest } from './calendar/index.js';
import { msUntilNextSunday, isCatchUpWindow } from './calendar/week.js';
```

- [ ] **Step 2: Añadir el planificador semanal**

Al final de `cron.js`, antes de la línea `export { updateAllUserSeries };`:

```js
// Resumen semanal del calendario: domingos a las 19:00.
const DIGEST_HOUR = 19;

function scheduleWeeklyDigest() {
  const ms = msUntilNextSunday(new Date(), DIGEST_HOUR);
  console.log(`[SEMANAL] Próximo resumen: ${new Date(Date.now() + ms).toLocaleString('es-ES')}`);

  setTimeout(async () => {
    await sendWeeklyDigest();
    scheduleWeeklyDigest();
  }, ms);
}
```

- [ ] **Step 3: Registrar el planificador y la recuperación en `startCronJob()`**

Sustituir el cuerpo de `startCronJob()` por:

```js
export function startCronJob() {
  console.log('[CRON] Servicio de actualización iniciado');
  console.log(`[CRON] Actualización diaria programada a las ${UPDATE_HOUR}:${String(UPDATE_MINUTE).padStart(2, '0')}`);

  // Programar la primera ejecución a las 7 AM
  scheduleNextRun();

  scheduleWeeklyDigest();

  // Si el contenedor estaba parado el domingo a las 19:00, el resumen sale
  // ahora, siempre que siga siendo la misma semana. sendWeeklyDigest ya se
  // protege con la marca de app_config, así que no puede duplicar.
  if (isCatchUpWindow(new Date())) {
    sendWeeklyDigest().catch(err => console.error(`[SEMANAL] ${err.message}`));
  }
}
```

- [ ] **Step 4: Verificar que la suite sigue en verde**

Run: `cd backend && npm test`
Expected: PASS — los 73 tests (30 previos + 43 de este plan).

- [ ] **Step 5: Comprobar el arranque y la programación**

Run: `cd /home/juan/Documentos/Desarrollo/listadomanga && docker compose up -d --build backend && sleep 6 && docker compose logs --tail=12 backend`
Expected: aparece `[SEMANAL] Próximo resumen: domingo, ... 19:00:00` junto a las líneas del cron diario, sin errores.

- [ ] **Step 6: Enviar un resumen real al canal**

Comprobación de extremo a extremo con datos de verdad. Se fuerza un `now` de
domingo para que la ventana sea la semana siguiente, y se usa una BD en memoria
para no escribir la marca de la semana en la base real.

Run:
```bash
cd /home/juan/Documentos/Desarrollo/listadomanga && docker compose exec -T backend node -e "
import('better-sqlite3').then(async ({ default: Database }) => {
  const { createSchema } = await import('./src/models/database.js');
  const { sendWeeklyDigest } = await import('./src/services/calendar/index.js');
  const db = new Database(':memory:');
  createSchema(db);
  const domingo = new Date(); domingo.setDate(domingo.getDate() + (7 - domingo.getDay()) % 7);
  console.log(await sendWeeklyDigest({ database: db, now: domingo }));
});"
```

Expected: `{ sent: true, count: <n> }` y el resumen en el canal, con las series y
los únicos de la semana siguiente. Contrastar un par de títulos contra
`https://www.listadomanga.es/calendario.php` para confirmar que las fechas y los
tipos cuadran.

- [ ] **Step 7: Documentar en el `README.md`**

Añadir después de la sección "Notificaciones a Discord":

```markdown
### Resumen semanal del calendario

Cada domingo a las 19:00 llega un único mensaje con lo que sale de lunes a
domingo de la semana siguiente, leyendo
[el calendario de listadomanga](https://www.listadomanga.es/calendario.php) en
directo:

- 📘 **Empiezan serie** — tomos nº1, los que el calendario marca como NOVEDAD.
- 📗 **Números únicos** — obras que se abren y se cierran en un tomo.

A diferencia de los avisos de novedades, esto no depende de las series que
sigues: cubre todo lo que se publica en España. Se descartan los coleccionables
de figuras, los packs y las sobrecubiertas alternativas.

Si una semana no sale nada, llega igualmente un aviso corto: así el silencio
nunca es ambiguo. Si el contenedor estaba parado el domingo, el resumen sale al
arrancar siempre que siga siendo la misma semana.

Usa el mismo `DISCORD_WEBHOOK_URL`; no hay configuración propia.
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/cron.js README.md
git commit -m "feat(calendario): planificador dominical y documentación"
```

---

## Verificación final

- [ ] `cd backend && npm test` — los 73 tests en verde.
- [ ] `docker compose logs backend | grep SEMANAL` — muestra la próxima fecha programada, en domingo a las 19:00.
- [ ] El resumen real recibido en el canal cuadra con el calendario web en fechas, tipos y editoriales.
- [ ] `git log --oneline` — 5 commits, ninguno con la URL del webhook.
