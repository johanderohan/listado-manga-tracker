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
