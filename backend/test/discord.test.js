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
