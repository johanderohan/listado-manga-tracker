import db from '../config/db.js';

// Núcleo compartido de scraping→persistencia. Antes este SQL estaba
// duplicado en routes/series.js (GET /:id, POST /:id/refresh,
// POST /refresh-all) y en services/cron.js. Se copia textualmente del
// original para no alterar el comportamiento.

// UPSERT de serie CON last_updated (refresh manual, refresh-all y cron).
export function upsertScrapedSeries(scrapedData, seriesId) {
  db.prepare(`
    INSERT OR REPLACE INTO series (id, name, original_name, author, artist, editorial_jp, editorial_es, reading_direction, total_volumes, released_volumes, is_complete, synopsis, url, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    scrapedData.id,
    scrapedData.name,
    scrapedData.original_name,
    scrapedData.author,
    scrapedData.artist,
    scrapedData.editorial_jp,
    scrapedData.editorial_es,
    scrapedData.reading_direction,
    scrapedData.total_volumes,
    scrapedData.released_volumes || scrapedData.total_volumes,
    scrapedData.is_complete,
    scrapedData.synopsis,
    `https://www.listadomanga.es/coleccion.php?id=${seriesId}`
  );
}

// UPSERT de serie SIN last_updated + volúmenes con INSERT OR REPLACE (caché
// perezosa de GET /:id cuando la serie aún no existía en local).
export function cacheScrapedSeries(scrapedData, seriesId) {
  db.prepare(`
    INSERT OR REPLACE INTO series (id, name, original_name, author, artist, editorial_jp, editorial_es, reading_direction, total_volumes, released_volumes, is_complete, synopsis, url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scrapedData.id,
    scrapedData.name,
    scrapedData.original_name,
    scrapedData.author,
    scrapedData.artist,
    scrapedData.editorial_jp,
    scrapedData.editorial_es,
    scrapedData.reading_direction,
    scrapedData.total_volumes,
    scrapedData.released_volumes || scrapedData.total_volumes,
    scrapedData.is_complete,
    scrapedData.synopsis,
    `https://www.listadomanga.es/coleccion.php?id=${seriesId}`
  );

  const insertVolume = db.prepare(`
    INSERT OR REPLACE INTO volumes (series_id, number, title, pages, price, cover_url, is_released, release_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const vol of scrapedData.volumes) {
    insertVolume.run(
      vol.series_id,
      vol.number,
      vol.title || `Tomo ${vol.number}`,
      vol.pages,
      vol.price,
      vol.cover_url,
      vol.is_released ?? 1,
      vol.release_date || null
    );
  }
}

// Reemplaza por completo los volúmenes de una serie (refresh/refresh-all/cron).
export function replaceVolumes(seriesId, volumes) {
  db.prepare('DELETE FROM volumes WHERE series_id = ?').run(seriesId);

  const insertVolume = db.prepare(`
    INSERT INTO volumes (series_id, number, title, pages, price, cover_url, is_released, release_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const vol of volumes) {
    insertVolume.run(
      vol.series_id,
      vol.number,
      vol.title || `Tomo ${vol.number}`,
      vol.pages,
      vol.price,
      vol.cover_url,
      vol.is_released ?? 1,
      vol.release_date || null
    );
  }
}

export function countVolumes(seriesId) {
  return db.prepare('SELECT COUNT(*) as count FROM volumes WHERE series_id = ?').get(seriesId).count;
}

export function setLastRefresh() {
  db.prepare(`
    INSERT OR REPLACE INTO app_config (key, value)
    VALUES ('last_refresh', datetime('now'))
  `).run();
}
