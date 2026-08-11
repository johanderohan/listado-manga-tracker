import Database from 'better-sqlite3';
import { createSchema } from '../../src/models/database.js';

// BD en memoria con el esquema real. Cada test crea la suya, así que no
// hay estado compartido entre tests.
export function makeTestDb() {
  const db = new Database(':memory:');
  createSchema(db);
  return db;
}

export function addSeries(db, id, extra = {}) {
  const s = {
    name: `Serie ${id}`,
    author: 'Autor Ejemplo',
    editorial_es: 'Norma Editorial',
    total_volumes: 10,
    released_volumes: 5,
    url: `https://www.listadomanga.es/coleccion.php?id=${id}`,
    ...extra
  };
  db.prepare(`
    INSERT OR REPLACE INTO series (id, name, author, editorial_es, total_volumes, released_volumes, url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, s.name, s.author, s.editorial_es, s.total_volumes, s.released_volumes, s.url);
}

export function addVolume(db, seriesId, number, extra = {}) {
  const v = {
    title: `Tomo ${number}`,
    pages: 200,
    price: 9.5,
    cover_url: `https://static.listadomanga.com/cover${seriesId}-${number}`,
    is_released: 1,
    release_date: 'Septiembre 2026',
    ...extra
  };
  db.prepare(`
    INSERT OR REPLACE INTO volumes (series_id, number, title, pages, price, cover_url, is_released, release_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(seriesId, number, v.title, v.pages, v.price, v.cover_url, v.is_released, v.release_date);
}

export function follow(db, seriesId, status = 'following') {
  db.prepare('INSERT OR REPLACE INTO user_series (series_id, status) VALUES (?, ?)').run(seriesId, status);
}

export function addWishlist(db, seriesId) {
  db.prepare('INSERT OR REPLACE INTO wishlist (series_id) VALUES (?)').run(seriesId);
}

export function buy(db, seriesId, number) {
  db.prepare('INSERT OR REPLACE INTO user_volumes (series_id, volume_number) VALUES (?, ?)').run(seriesId, number);
}
