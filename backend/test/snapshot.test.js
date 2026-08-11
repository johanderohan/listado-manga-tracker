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
