import { Router } from 'express';
import db from '../models/database.js';
import { scrapeSeriesList, scrapeSeriesDetail, searchSeries } from '../services/scraper.js';

const router = Router();

// Obtener todas las series (de la base de datos local)
router.get('/', (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buscar series en listadomanga.es (scraping en tiempo real)
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Parámetro de búsqueda requerido' });
    }

    const results = await searchSeries(q);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener detalle de una serie
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Primero buscar en la base de datos local
    let series = db.prepare('SELECT * FROM series WHERE id = ?').get(id);
    let volumes = db.prepare('SELECT * FROM volumes WHERE series_id = ? ORDER BY number').all(id);

    // Si no existe o los datos son antiguos, hacer scraping
    if (!series) {
      const scrapedData = await scrapeSeriesDetail(id);

      // Guardar en la base de datos
      const insertSeries = db.prepare(`
        INSERT OR REPLACE INTO series (id, name, original_name, author, artist, editorial_jp, editorial_es, total_volumes, released_volumes, is_complete, synopsis, url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertSeries.run(
        scrapedData.id,
        scrapedData.name,
        scrapedData.original_name,
        scrapedData.author,
        scrapedData.artist,
        scrapedData.editorial_jp,
        scrapedData.editorial_es,
        scrapedData.total_volumes,
        scrapedData.released_volumes || scrapedData.total_volumes,
        scrapedData.is_complete,
        scrapedData.synopsis,
        `https://www.listadomanga.es/coleccion.php?id=${id}`
      );

      // Guardar volúmenes
      const insertVolume = db.prepare(`
        INSERT OR REPLACE INTO volumes (series_id, number, title, pages, price, cover_url, is_released)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const vol of scrapedData.volumes) {
        insertVolume.run(
          vol.series_id,
          vol.number,
          vol.title || `Tomo ${vol.number}`,
          vol.pages,
          vol.price,
          vol.cover_url,
          vol.is_released ?? 1
        );
      }

      series = scrapedData;
      volumes = scrapedData.volumes;
    }

    res.json({ ...series, volumes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sincronizar listado de series desde listadomanga.es
router.post('/sync', async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Refrescar datos de una serie específica (forzar re-scraping)
router.post('/:id/refresh', async (req, res) => {
  try {
    const { id } = req.params;

    // Hacer scraping fresco
    const scrapedData = await scrapeSeriesDetail(id);

    // Actualizar serie en la base de datos
    db.prepare(`
      INSERT OR REPLACE INTO series (id, name, original_name, author, artist, editorial_jp, editorial_es, total_volumes, released_volumes, is_complete, synopsis, url, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      scrapedData.id,
      scrapedData.name,
      scrapedData.original_name,
      scrapedData.author,
      scrapedData.artist,
      scrapedData.editorial_jp,
      scrapedData.editorial_es,
      scrapedData.total_volumes,
      scrapedData.released_volumes || scrapedData.total_volumes,
      scrapedData.is_complete,
      scrapedData.synopsis,
      `https://www.listadomanga.es/coleccion.php?id=${id}`
    );

    // Eliminar volúmenes antiguos y añadir los nuevos
    db.prepare('DELETE FROM volumes WHERE series_id = ?').run(id);

    const insertVolume = db.prepare(`
      INSERT INTO volumes (series_id, number, title, pages, price, cover_url, is_released)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const vol of scrapedData.volumes) {
      insertVolume.run(
        vol.series_id,
        vol.number,
        vol.title || `Tomo ${vol.number}`,
        vol.pages,
        vol.price,
        vol.cover_url,
        vol.is_released ?? 1
      );
    }

    // Obtener volúmenes actualizados con estado de compra del usuario
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Refrescar todas las series que el usuario sigue
router.post('/refresh-all', async (req, res) => {
  try {
    const userSeries = db.prepare(`
      SELECT series_id FROM user_series
    `).all();

    const results = [];
    for (const { series_id } of userSeries) {
      try {
        const scrapedData = await scrapeSeriesDetail(series_id);

        // Contar tomos anteriores
        const oldCount = db.prepare('SELECT COUNT(*) as count FROM volumes WHERE series_id = ?').get(series_id).count;

        // Actualizar serie
        db.prepare(`
          INSERT OR REPLACE INTO series (id, name, original_name, author, artist, editorial_jp, editorial_es, total_volumes, released_volumes, is_complete, synopsis, url, last_updated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          scrapedData.id,
          scrapedData.name,
          scrapedData.original_name,
          scrapedData.author,
          scrapedData.artist,
          scrapedData.editorial_jp,
          scrapedData.editorial_es,
          scrapedData.total_volumes,
          scrapedData.released_volumes || scrapedData.total_volumes,
          scrapedData.is_complete,
          scrapedData.synopsis,
          `https://www.listadomanga.es/coleccion.php?id=${series_id}`
        );

        // Actualizar volúmenes
        db.prepare('DELETE FROM volumes WHERE series_id = ?').run(series_id);

        const insertVolume = db.prepare(`
          INSERT INTO volumes (series_id, number, title, pages, price, cover_url, is_released)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const vol of scrapedData.volumes) {
          insertVolume.run(
            vol.series_id,
            vol.number,
            vol.title || `Tomo ${vol.number}`,
            vol.pages,
            vol.price,
            vol.cover_url,
            vol.is_released ?? 1
          );
        }

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
    res.json({
      message: `Actualizadas ${results.length} series. ${totalNew} tomos nuevos encontrados.`,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
