import db from '../config/db.js';
import { scrapeSeriesList, scrapeSeriesDetail, searchSeries } from '../services/scraper.js';
import {
  upsertScrapedSeries,
  cacheScrapedSeries,
  replaceVolumes,
  countVolumes,
  setLastRefresh
} from '../services/seriesSync.service.js';

// GET /api/series — series cacheadas en la BD local (con búsqueda)
export function listSeries(req, res) {
  const { search, limit = 50, offset = 0 } = req.query;

  let query = 'SELECT * FROM series';
  const params = [];

  if (search) {
    query += ' WHERE name LIKE ?';
    params.push(`%${search}%`);
  }

  query += ' ORDER BY name LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const series = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM series').get();

  res.json({ series, total: total.count });
}

// GET /api/series/search — búsqueda en tiempo real en listadomanga.es
export async function searchSeriesRemote(req, res) {
  const { q } = req.query;
  if (!q) {
    const err = new Error('Parámetro de búsqueda requerido');
    err.status = 400;
    throw err;
  }

  const results = await searchSeries(q);
  res.json(results);
}

// GET /api/series/:id — detalle; si no está en local, scrape y cachea
export async function getSeriesDetail(req, res) {
  const { id } = req.params;

  let series = db.prepare('SELECT * FROM series WHERE id = ?').get(id);
  let volumes = db.prepare('SELECT * FROM volumes WHERE series_id = ? ORDER BY number').all(id);

  if (!series) {
    const scrapedData = await scrapeSeriesDetail(id);
    cacheScrapedSeries(scrapedData, id);
    series = scrapedData;
    volumes = scrapedData.volumes;
  }

  res.json({ ...series, volumes });
}

// POST /api/series/sync — sincroniza el listado completo desde listadomanga.es
export async function syncSeries(req, res) {
  const seriesList = await scrapeSeriesList();

  const insertSeries = db.prepare(`
    INSERT OR IGNORE INTO series (id, name, url)
    VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction((series) => {
    for (const s of series) {
      insertSeries.run(s.id, s.name, s.url);
    }
  });

  insertMany(seriesList);

  res.json({ message: `Sincronizadas ${seriesList.length} series` });
}

// POST /api/series/:id/refresh — fuerza re-scraping de una serie
export async function refreshSeries(req, res) {
  const { id } = req.params;

  const scrapedData = await scrapeSeriesDetail(id);
  upsertScrapedSeries(scrapedData, id);
  replaceVolumes(id, scrapedData.volumes);

  const volumes = db.prepare(`
    SELECT v.*, CASE WHEN uv.id IS NOT NULL THEN 1 ELSE 0 END as owned
    FROM volumes v
    LEFT JOIN user_volumes uv ON uv.series_id = v.series_id AND uv.volume_number = v.number
    WHERE v.series_id = ?
    ORDER BY v.number
  `).all(id);

  const series = db.prepare('SELECT * FROM series WHERE id = ?').get(id);

  res.json({
    message: `Serie actualizada: ${scrapedData.volumes.length} tomos encontrados`,
    series: { ...series, volumes }
  });
}

// POST /api/series/refresh-all — actualiza todas las series seguidas
export async function refreshAllSeries(req, res) {
  const userSeries = db.prepare(`
    SELECT series_id FROM user_series
  `).all();

  const results = [];
  for (const { series_id } of userSeries) {
    try {
      const scrapedData = await scrapeSeriesDetail(series_id);

      const oldCount = countVolumes(series_id);

      upsertScrapedSeries(scrapedData, series_id);
      replaceVolumes(series_id, scrapedData.volumes);

      const newCount = scrapedData.volumes.length;
      results.push({
        id: series_id,
        name: scrapedData.name,
        oldCount,
        newCount,
        newVolumes: newCount - oldCount
      });
    } catch (err) {
      results.push({ id: series_id, error: err.message });
    }
  }

  const totalNew = results.reduce((sum, r) => sum + (r.newVolumes || 0), 0);

  setLastRefresh();

  res.json({
    message: `Actualizadas ${results.length} series. ${totalNew} tomos nuevos encontrados.`,
    results
  });
}
