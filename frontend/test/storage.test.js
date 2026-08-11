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
