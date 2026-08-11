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
