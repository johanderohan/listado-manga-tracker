import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pendingVolumes, upcomingVolumes, recentVolumes, mySeries,
  seriesDetail, wishlistSeries, homeStats, searchSeries
} from '../src/lib/collection.js';

function snapshot(extra = {}) {
  return {
    generatedAt: '2026-08-11T18:00:00.000Z',
    lastRefresh: '2026-08-11 07:04:12',
    series: [
      { id: 1, name: 'Berserk', original_name: 'Beruseruku', editorial_es: 'Panini', total_volumes: 3, is_complete: 0, status: 'following' },
      { id: 2, name: 'Shōnan Junai Gumi', original_name: null, editorial_es: 'Ivrea', total_volumes: 2, is_complete: 1, status: 'following' },
      { id: 3, name: 'Descartada', original_name: null, editorial_es: 'Norma', total_volumes: 1, is_complete: 0, status: 'discarded' },
      { id: 4, name: 'Solo Deseada', original_name: null, editorial_es: 'Milky', total_volumes: 1, is_complete: 0, status: null }
    ],
    volumes: [
      { series_id: 1, number: 1, price: 9.5, release_date: 'Enero 2026', is_released: 1, cover_url: 'https://x/b1.jpg' },
      { series_id: 1, number: 2, price: 9.5, release_date: 'Marzo 2026', is_released: 1, cover_url: 'https://x/b2.jpg' },
      { series_id: 1, number: 3, price: 9.5, release_date: 'Diciembre 2026', is_released: 0, cover_url: 'https://x/b3.jpg' },
      { series_id: 2, number: 1, price: 8, release_date: 'Febrero 2026', is_released: 1, cover_url: 'https://x/s1.jpg' },
      { series_id: 2, number: 2, price: 8, release_date: 'Abril 2026', is_released: 1, cover_url: 'https://x/s2.jpg' },
      { series_id: 3, number: 1, price: 7, release_date: 'Enero 2026', is_released: 1, cover_url: 'https://x/d1.jpg' },
      { series_id: 4, number: 1, price: 7, release_date: 'Enero 2026', is_released: 1, cover_url: 'https://x/w1.jpg' }
    ],
    owned: [
      { series_id: 1, volume_number: 1, purchased_at: '2026-01-15 10:00:00' },
      { series_id: 2, volume_number: 1, purchased_at: '2026-03-20 10:00:00' },
      { series_id: 2, volume_number: 2, purchased_at: '2026-04-25 10:00:00' }
    ],
    wishlist: [{ series_id: 4, notes: 'me interesa' }],
    ...extra
  };
}

test('los pendientes son los publicados sin comprar de series seguidas', () => {
  const p = pendingVolumes(snapshot());
  assert.deepEqual(p.map(v => `${v.series_id}:${v.number}`), ['1:2']);
  assert.equal(p[0].series_name, 'Berserk');
  assert.equal(p[0].series_cover, 'https://x/b1.jpg');
});

test('los pendientes no incluyen descartadas ni las de solo wishlist', () => {
  const ids = pendingVolumes(snapshot()).map(v => v.series_id);
  assert.ok(!ids.includes(3));
  assert.ok(!ids.includes(4));
});

test('los pendientes se ordenan por fecha descendente', () => {
  const snap = snapshot();
  snap.owned = [];
  const p = pendingVolumes(snap);
  assert.deepEqual(p.map(v => v.release_date), ['Abril 2026', 'Marzo 2026', 'Febrero 2026', 'Enero 2026']);
});

test('los próximos son los no publicados con fecha, ascendente', () => {
  const u = upcomingVolumes(snapshot());
  assert.equal(u.length, 1);
  assert.equal(u[0].number, 3);
  assert.equal(u[0].series_name, 'Berserk');
});

test('los recientes van por fecha de compra descendente y con tope', () => {
  const r = recentVolumes(snapshot());
  assert.deepEqual(r.map(v => v.purchased_at), ['2026-04-25 10:00:00', '2026-03-20 10:00:00', '2026-01-15 10:00:00']);
  assert.equal(r[0].series_name, 'Shōnan Junai Gumi');
  assert.equal(recentVolumes(snapshot(), 2).length, 2);
});

test('mis series traen progreso, comprados y portada del tomo 1', () => {
  const s = mySeries(snapshot()).find(x => x.id === 1);
  assert.equal(s.owned_volumes, 1);
  assert.equal(s.total_volumes, 3);
  assert.equal(s.progress, 33.3);
  assert.equal(s.cover_url, 'https://x/b1.jpg');
});

test('el progreso es 0 si no se conoce el total', () => {
  const snap = snapshot();
  snap.series[0].total_volumes = 0;
  assert.equal(mySeries(snap).find(s => s.id === 1).progress, 0);
});

test('la ficha marca qué tomos se tienen, ordenados por número', () => {
  const d = seriesDetail(snapshot(), 1);
  assert.deepEqual(d.volumes.map(v => [v.number, v.owned]), [[1, 1], [2, 0], [3, 0]]);
  assert.equal(d.name, 'Berserk');
});

test('la ficha de una serie inexistente es null y una sin tomos no rompe', () => {
  assert.equal(seriesDetail(snapshot(), 999), null);
  const snap = snapshot();
  snap.volumes = [];
  assert.deepEqual(seriesDetail(snap, 1).volumes, []);
});

test('el buscador ignora mayúsculas y acentos', () => {
  const lista = mySeries(snapshot());
  assert.deepEqual(searchSeries(lista, 'shonan').map(s => s.id), [2]);
  assert.deepEqual(searchSeries(lista, 'BERSERK').map(s => s.id), [1]);
  assert.equal(searchSeries(lista, '').length, lista.length);
});

test('el buscador también mira el título original', () => {
  assert.deepEqual(searchSeries(mySeries(snapshot()), 'beruseruku').map(s => s.id), [1]);
});

test('la wishlist resuelve las series aunque no se sigan', () => {
  const w = wishlistSeries(snapshot());
  assert.equal(w.length, 1);
  assert.equal(w[0].id, 4);
  assert.equal(w[0].notes, 'me interesa');
  assert.equal(w[0].cover_url, 'https://x/w1.jpg');
});

test('los contadores de la home cuadran', () => {
  const st = homeStats(snapshot());
  assert.equal(st.totalSeries, 3);      // following + discarded, no la de solo wishlist
  assert.equal(st.totalVolumes, 3);     // tomos comprados
  assert.equal(st.wishlistCount, 1);
  assert.equal(st.completedSeries, 1);  // Shōnan: completa y con sus 2 tomos
  assert.equal(st.lastRefresh, '2026-08-11 07:04:12');
});
