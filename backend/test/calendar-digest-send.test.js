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
    // Semana del 24 al 30: el fixture solo tiene salidas el 14 y el 18.
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
