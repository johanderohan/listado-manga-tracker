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
