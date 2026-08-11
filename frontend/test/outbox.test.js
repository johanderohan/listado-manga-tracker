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
