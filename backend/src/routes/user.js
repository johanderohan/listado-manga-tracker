import { Router } from 'express';
import db from '../models/database.js';

const router = Router();

// === SERIES DEL USUARIO ===

// Obtener todas las series que sigue el usuario con progreso
router.get('/series', (req, res) => {
  try {
    const { status = 'following' } = req.query;

    const series = db.prepare(`
      SELECT
        s.*,
        us.status,
        us.added_at,
        COUNT(DISTINCT uv.volume_number) as owned_volumes,
        s.total_volumes,
        CASE
          WHEN s.total_volumes > 0
          THEN ROUND(COUNT(DISTINCT uv.volume_number) * 100.0 / s.total_volumes, 1)
          ELSE 0
        END as progress,
        (SELECT cover_url FROM volumes WHERE series_id = s.id AND number = 1 LIMIT 1) as cover_url
      FROM user_series us
      JOIN series s ON s.id = us.series_id
      LEFT JOIN user_volumes uv ON uv.series_id = s.id
      WHERE us.status = ?
      GROUP BY s.id
      ORDER BY s.name ASC
    `).all(status);

    res.json(series);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Seguir una serie
router.post('/series/:seriesId', (req, res) => {
  try {
    const { seriesId } = req.params;

    db.prepare(`
      INSERT OR IGNORE INTO user_series (series_id, status)
      VALUES (?, 'following')
    `).run(seriesId);

    res.json({ message: 'Serie añadida' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dejar de seguir una serie
router.delete('/series/:seriesId', (req, res) => {
  try {
    const { seriesId } = req.params;

    db.prepare('DELETE FROM user_series WHERE series_id = ?').run(seriesId);
    res.json({ message: 'Serie eliminada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Descartar una serie
router.post('/series/:seriesId/discard', (req, res) => {
  try {
    const { seriesId } = req.params;

    db.prepare(`
      UPDATE user_series
      SET status = 'discarded'
      WHERE series_id = ?
    `).run(seriesId);

    res.json({ message: 'Serie movida a descartadas' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Volver a seguir una serie (desde descartadas)
router.post('/series/:seriesId/follow', (req, res) => {
  try {
    const { seriesId } = req.params;

    db.prepare(`
      UPDATE user_series
      SET status = 'following'
      WHERE series_id = ?
    `).run(seriesId);

    res.json({ message: 'Serie movida a siguiendo' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === TOMOS COMPRADOS ===

// Obtener próximos tomos pendientes de comprar (solo publicados)
router.get('/pending', (req, res) => {
  try {
    const monthOrder = {
      'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
      'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
      'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };

    const pending = db.prepare(`
      SELECT
        v.*,
        s.name as series_name,
        s.editorial_es,
        (SELECT cover_url FROM volumes WHERE series_id = s.id AND number = 1 LIMIT 1) as series_cover
      FROM volumes v
      JOIN series s ON s.id = v.series_id
      JOIN user_series us ON us.series_id = s.id
      LEFT JOIN user_volumes uv ON uv.series_id = v.series_id AND uv.volume_number = v.number
      WHERE us.status = 'following' AND uv.id IS NULL AND v.is_released = 1
    `).all();

    // Ordenar por fecha de lanzamiento descendente (recientes primero)
    pending.sort((a, b) => {
      const parseDate = (dateStr) => {
        if (!dateStr) return '0000-00';
        const parts = dateStr.toLowerCase().split(' ');
        if (parts.length !== 2) return '0000-00';
        const month = monthOrder[parts[0]] || '00';
        const year = parts[1] || '0000';
        return `${year}-${month}`;
      };
      const cmp = parseDate(b.release_date).localeCompare(parseDate(a.release_date));
      if (cmp !== 0) return cmp;
      return a.series_name.localeCompare(b.series_name) || a.number - b.number;
    });

    res.json(pending);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener próximos lanzamientos (tomos no publicados con fecha)
router.get('/upcoming', (req, res) => {
  try {
    // Mapeo de meses en español a números para ordenar
    const monthOrder = {
      'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
      'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
      'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };

    const upcoming = db.prepare(`
      SELECT
        v.*,
        s.name as series_name,
        s.editorial_es,
        (SELECT cover_url FROM volumes WHERE series_id = s.id AND number = 1 LIMIT 1) as series_cover
      FROM volumes v
      JOIN series s ON s.id = v.series_id
      JOIN user_series us ON us.series_id = s.id
      WHERE us.status = 'following' AND v.is_released = 0 AND v.release_date IS NOT NULL
      ORDER BY v.release_date
    `).all();

    // Ordenar por fecha (parsear "Mes Año" a fecha comparable)
    upcoming.sort((a, b) => {
      const parseDate = (dateStr) => {
        if (!dateStr) return '9999-12';
        const parts = dateStr.toLowerCase().split(' ');
        if (parts.length !== 2) return '9999-12';
        const month = monthOrder[parts[0]] || '12';
        const year = parts[1] || '9999';
        return `${year}-${month}`;
      };
      return parseDate(a.release_date).localeCompare(parseDate(b.release_date));
    });

    res.json(upcoming);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener tomos comprados de una serie
router.get('/series/:seriesId/volumes', (req, res) => {
  try {
    const { seriesId } = req.params;

    const volumes = db.prepare(`
      SELECT
        v.*,
        CASE WHEN uv.id IS NOT NULL THEN 1 ELSE 0 END as owned
      FROM volumes v
      LEFT JOIN user_volumes uv ON uv.series_id = v.series_id AND uv.volume_number = v.number
      WHERE v.series_id = ?
      ORDER BY v.number
    `).all(seriesId);

    res.json(volumes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marcar tomo como comprado
router.post('/volumes', (req, res) => {
  try {
    const { seriesId, volumeNumber } = req.body;

    db.prepare(`
      INSERT OR IGNORE INTO user_volumes (series_id, volume_number)
      VALUES (?, ?)
    `).run(seriesId, volumeNumber);

    res.json({ message: 'Tomo marcado como comprado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marcar varios tomos como comprados
router.post('/volumes/bulk', (req, res) => {
  try {
    const { seriesId, volumeNumbers } = req.body;

    const insert = db.prepare(`
      INSERT OR IGNORE INTO user_volumes (series_id, volume_number)
      VALUES (?, ?)
    `);

    const insertMany = db.transaction((volumes) => {
      for (const num of volumes) {
        insert.run(seriesId, num);
      }
    });

    insertMany(volumeNumbers);

    res.json({ message: `${volumeNumbers.length} tomos marcados como comprados` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Desmarcar tomo como comprado
router.delete('/volumes/:seriesId/:volumeNumber', (req, res) => {
  try {
    const { seriesId, volumeNumber } = req.params;

    db.prepare(`
      DELETE FROM user_volumes
      WHERE series_id = ? AND volume_number = ?
    `).run(seriesId, volumeNumber);

    res.json({ message: 'Tomo desmarcado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === WISHLIST ===

// Obtener wishlist
router.get('/wishlist', (req, res) => {
  try {
    const wishlist = db.prepare(`
      SELECT
        s.*,
        w.added_at,
        w.notes,
        (SELECT cover_url FROM volumes WHERE series_id = s.id AND number = 1 LIMIT 1) as cover_url
      FROM wishlist w
      JOIN series s ON s.id = w.series_id
      ORDER BY s.name ASC
    `).all();

    res.json(wishlist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Añadir a wishlist
router.post('/wishlist/:seriesId', (req, res) => {
  try {
    const { seriesId } = req.params;
    const { notes } = req.body;

    db.prepare(`
      INSERT OR REPLACE INTO wishlist (series_id, notes)
      VALUES (?, ?)
    `).run(seriesId, notes || null);

    res.json({ message: 'Añadido a wishlist' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar de wishlist
router.delete('/wishlist/:seriesId', (req, res) => {
  try {
    const { seriesId } = req.params;

    db.prepare('DELETE FROM wishlist WHERE series_id = ?').run(seriesId);
    res.json({ message: 'Eliminado de wishlist' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === ESTADÍSTICAS ===

router.get('/stats', (req, res) => {
  try {
    const lastRefreshRow = db.prepare("SELECT value FROM app_config WHERE key = 'last_refresh'").get();

    const stats = {
      totalSeries: db.prepare('SELECT COUNT(*) as count FROM user_series').get().count,
      totalVolumes: db.prepare('SELECT COUNT(*) as count FROM user_volumes').get().count,
      wishlistCount: db.prepare('SELECT COUNT(*) as count FROM wishlist').get().count,
      completedSeries: db.prepare(`
        SELECT COUNT(*) as count
        FROM user_series us
        JOIN series s ON s.id = us.series_id
        WHERE s.is_complete = 1
        AND (SELECT COUNT(*) FROM user_volumes uv WHERE uv.series_id = s.id) = s.total_volumes
      `).get().count,
      lastRefresh: lastRefreshRow?.value || null
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
