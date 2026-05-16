import db from '../config/db.js';
import { toInt, toIntArray, toIntInRange } from '../middleware/sanitize.js';

const MONTH_ORDER = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
};

// === SERIES DEL USUARIO ===

// GET /api/user/series
export function listUserSeries(req, res) {
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
}

// POST /api/user/series/:seriesId
export function followSeries(req, res) {
  const seriesId = toInt(req.params.seriesId, 'seriesId');

  db.prepare(`
    INSERT OR IGNORE INTO user_series (series_id, status)
    VALUES (?, 'following')
  `).run(seriesId);

  res.json({ message: 'Serie añadida' });
}

// DELETE /api/user/series/:seriesId
export function unfollowSeries(req, res) {
  const seriesId = toInt(req.params.seriesId, 'seriesId');

  db.prepare('DELETE FROM user_series WHERE series_id = ?').run(seriesId);
  res.json({ message: 'Serie eliminada' });
}

// POST /api/user/series/:seriesId/discard
export function discardSeries(req, res) {
  const seriesId = toInt(req.params.seriesId, 'seriesId');

  db.prepare(`
    UPDATE user_series
    SET status = 'discarded'
    WHERE series_id = ?
  `).run(seriesId);

  res.json({ message: 'Serie movida a descartadas' });
}

// POST /api/user/series/:seriesId/follow
export function refollowSeries(req, res) {
  const seriesId = toInt(req.params.seriesId, 'seriesId');

  db.prepare(`
    UPDATE user_series
    SET status = 'following'
    WHERE series_id = ?
  `).run(seriesId);

  res.json({ message: 'Serie movida a siguiendo' });
}

// === TOMOS ===

// GET /api/user/pending — tomos publicados sin comprar
export function getPending(req, res) {
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
      const month = MONTH_ORDER[parts[0]] || '00';
      const year = parts[1] || '0000';
      return `${year}-${month}`;
    };
    const cmp = parseDate(b.release_date).localeCompare(parseDate(a.release_date));
    if (cmp !== 0) return cmp;
    return a.series_name.localeCompare(b.series_name) || a.number - b.number;
  });

  res.json(pending);
}

// GET /api/user/upcoming — tomos no publicados con fecha
export function getUpcoming(req, res) {
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

  upcoming.sort((a, b) => {
    const parseDate = (dateStr) => {
      if (!dateStr) return '9999-12';
      const parts = dateStr.toLowerCase().split(' ');
      if (parts.length !== 2) return '9999-12';
      const month = MONTH_ORDER[parts[0]] || '12';
      const year = parts[1] || '9999';
      return `${year}-${month}`;
    };
    return parseDate(a.release_date).localeCompare(parseDate(b.release_date));
  });

  res.json(upcoming);
}

// GET /api/user/recent — últimos tomos comprados (el último primero)
export function getRecentVolumes(req, res) {
  const limit = toIntInRange(req.query.limit, 'limit', 1, 200, 50);

  const recent = db.prepare(`
    SELECT
      v.*,
      s.id as series_id,
      s.name as series_name,
      s.editorial_es,
      uv.purchased_at,
      (SELECT cover_url FROM volumes WHERE series_id = s.id AND number = 1 LIMIT 1) as series_cover
    FROM user_volumes uv
    JOIN series s ON s.id = uv.series_id
    JOIN volumes v ON v.series_id = uv.series_id AND v.number = uv.volume_number
    ORDER BY uv.purchased_at DESC
    LIMIT ?
  `).all(limit);

  res.json(recent);
}

// GET /api/user/series/:seriesId/volumes
export function getSeriesVolumes(req, res) {
  const seriesId = toInt(req.params.seriesId, 'seriesId');

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
}

// POST /api/user/volumes
export function markVolume(req, res) {
  const seriesId = toInt(req.body.seriesId, 'seriesId');
  const volumeNumber = toInt(req.body.volumeNumber, 'volumeNumber');

  db.prepare(`
    INSERT OR IGNORE INTO user_volumes (series_id, volume_number)
    VALUES (?, ?)
  `).run(seriesId, volumeNumber);

  res.json({ message: 'Tomo marcado como comprado' });
}

// POST /api/user/volumes/bulk
export function markVolumesBulk(req, res) {
  const seriesId = toInt(req.body.seriesId, 'seriesId');
  const volumeNumbers = toIntArray(req.body.volumeNumbers, 'volumeNumbers');

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
}

// DELETE /api/user/volumes/:seriesId/:volumeNumber
export function unmarkVolume(req, res) {
  const seriesId = toInt(req.params.seriesId, 'seriesId');
  const volumeNumber = toInt(req.params.volumeNumber, 'volumeNumber');

  db.prepare(`
    DELETE FROM user_volumes
    WHERE series_id = ? AND volume_number = ?
  `).run(seriesId, volumeNumber);

  res.json({ message: 'Tomo desmarcado' });
}

// === WISHLIST ===

// GET /api/user/wishlist
export function getWishlist(req, res) {
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
}

// POST /api/user/wishlist/:seriesId
export function addToWishlist(req, res) {
  const seriesId = toInt(req.params.seriesId, 'seriesId');
  const { notes } = req.body || {};

  db.prepare(`
    INSERT OR REPLACE INTO wishlist (series_id, notes)
    VALUES (?, ?)
  `).run(seriesId, notes || null);

  res.json({ message: 'Añadido a wishlist' });
}

// DELETE /api/user/wishlist/:seriesId
export function removeFromWishlist(req, res) {
  const seriesId = toInt(req.params.seriesId, 'seriesId');

  db.prepare('DELETE FROM wishlist WHERE series_id = ?').run(seriesId);
  res.json({ message: 'Eliminado de wishlist' });
}

// === ESTADÍSTICAS ===

// GET /api/user/stats
export function getStats(req, res) {
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
}

// GET /api/user/statistics — agregados exhaustivos para la página de stats
export function getStatistics(req, res) {
  const lastRefreshRow = db.prepare("SELECT value FROM app_config WHERE key = 'last_refresh'").get();

  // Conteo de series por estado
  const statusRows = db
    .prepare('SELECT status, COUNT(*) as c FROM user_series GROUP BY status')
    .all();
  const followingSeries = statusRows.find((r) => r.status === 'following')?.c || 0;
  const discardedSeries = statusRows.find((r) => r.status === 'discarded')?.c || 0;

  // Gasto total / medio sobre tomos comprados
  const spend = db
    .prepare(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(v.price), 0) as spent,
        COALESCE(AVG(NULLIF(v.price, 0)), 0) as avgPrice,
        COALESCE(MAX(v.price), 0) as maxPrice
      FROM user_volumes uv
      JOIN volumes v ON v.series_id = uv.series_id AND v.number = uv.volume_number
    `)
    .get();

  // Tomos publicados pendientes (series seguidas, no comprados) + coste
  const pending = db
    .prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(v.price), 0) as cost
      FROM volumes v
      JOIN user_series us ON us.series_id = v.series_id AND us.status = 'following'
      LEFT JOIN user_volumes uv ON uv.series_id = v.series_id AND uv.volume_number = v.number
      WHERE uv.id IS NULL AND v.is_released = 1
    `)
    .get();

  const upcomingCount = db
    .prepare(`
      SELECT COUNT(*) as c
      FROM volumes v
      JOIN user_series us ON us.series_id = v.series_id AND us.status = 'following'
      WHERE v.is_released = 0 AND v.release_date IS NOT NULL
    `)
    .get().c;

  const completedSeries = db
    .prepare(`
      SELECT COUNT(*) as count
      FROM user_series us
      JOIN series s ON s.id = us.series_id
      WHERE s.is_complete = 1
      AND (SELECT COUNT(*) FROM user_volumes uv WHERE uv.series_id = s.id) = s.total_volumes
    `)
    .get().count;

  const wishlistCount = db.prepare('SELECT COUNT(*) as count FROM wishlist').get().count;

  const range = db
    .prepare('SELECT MIN(purchased_at) as first, MAX(purchased_at) as last FROM user_volumes')
    .get();

  const summary = {
    totalSeries: followingSeries + discardedSeries,
    followingSeries,
    discardedSeries,
    totalVolumesOwned: spend.count,
    completedSeries,
    wishlistCount,
    totalSpent: Math.round(spend.spent * 100) / 100,
    avgVolumePrice: Math.round(spend.avgPrice * 100) / 100,
    maxVolumePrice: Math.round(spend.maxPrice * 100) / 100,
    pendingCount: pending.count,
    pendingCost: Math.round(pending.cost * 100) / 100,
    upcomingCount,
    firstPurchase: range.first || null,
    lastPurchase: range.last || null,
    lastRefresh: lastRefreshRow?.value || null
  };

  // Desglose por editorial española
  const byEditorial = db
    .prepare(`
      SELECT
        COALESCE(NULLIF(s.editorial_es, ''), 'Sin editorial') as editorial,
        COUNT(DISTINCT us.series_id) as seriesCount,
        COUNT(uv.id) as volumesOwned,
        COALESCE(SUM(v.price), 0) as spent
      FROM user_series us
      JOIN series s ON s.id = us.series_id
      LEFT JOIN user_volumes uv ON uv.series_id = us.series_id
      LEFT JOIN volumes v ON v.series_id = uv.series_id AND v.number = uv.volume_number
      GROUP BY editorial
      ORDER BY volumesOwned DESC, seriesCount DESC
    `)
    .all()
    .map((r) => ({ ...r, spent: Math.round(r.spent * 100) / 100 }));

  // Distribución por sentido de lectura (series seguidas)
  const byReadingDirection = db
    .prepare(`
      SELECT
        COALESCE(NULLIF(s.reading_direction, ''), 'Desconocido') as direction,
        COUNT(*) as count
      FROM user_series us
      JOIN series s ON s.id = us.series_id
      WHERE us.status = 'following'
      GROUP BY direction
      ORDER BY count DESC
    `)
    .all();

  // Compras por mes (timeline)
  const purchasesByMonth = db
    .prepare(`
      SELECT
        strftime('%Y-%m', purchased_at) as ym,
        COUNT(*) as count,
        COALESCE(SUM(v.price), 0) as spent
      FROM user_volumes uv
      JOIN volumes v ON v.series_id = uv.series_id AND v.number = uv.volume_number
      WHERE purchased_at IS NOT NULL
      GROUP BY ym
      ORDER BY ym
    `)
    .all()
    .map((r) => ({ ...r, spent: Math.round(r.spent * 100) / 100 }));

  // Compras por día (mapa de calor tipo calendario)
  const purchasesByDay = db
    .prepare(`
      SELECT date(purchased_at) as date, COUNT(*) as count
      FROM user_volumes
      WHERE purchased_at IS NOT NULL
      GROUP BY date
      ORDER BY date
    `)
    .all();

  // Compras por día de la semana (0=domingo .. 6=sábado)
  const purchasesByWeekday = db
    .prepare(`
      SELECT CAST(strftime('%w', purchased_at) AS INTEGER) as weekday, COUNT(*) as count
      FROM user_volumes
      WHERE purchased_at IS NOT NULL
      GROUP BY weekday
    `)
    .all();

  // Series con más tomos en propiedad
  const topSeries = db
    .prepare(`
      SELECT
        s.id, s.name, s.total_volumes as total, s.is_complete,
        COUNT(uv.id) as owned,
        COALESCE(SUM(v.price), 0) as spent
      FROM user_series us
      JOIN series s ON s.id = us.series_id
      LEFT JOIN user_volumes uv ON uv.series_id = s.id
      LEFT JOIN volumes v ON v.series_id = uv.series_id AND v.number = uv.volume_number
      WHERE us.status = 'following'
      GROUP BY s.id
      ORDER BY owned DESC, s.name ASC
      LIMIT 15
    `)
    .all()
    .map((r) => ({ ...r, spent: Math.round(r.spent * 100) / 100 }));

  // Series completas y enteramente coleccionadas
  const completedList = db
    .prepare(`
      SELECT s.id, s.name, s.total_volumes as total, COUNT(uv.id) as owned
      FROM user_series us
      JOIN series s ON s.id = us.series_id
      LEFT JOIN user_volumes uv ON uv.series_id = s.id
      WHERE us.status = 'following' AND s.is_complete = 1
      GROUP BY s.id
      HAVING s.total_volumes > 0 AND owned >= s.total_volumes
      ORDER BY s.name ASC
    `)
    .all();

  // Series completas que aún te faltan tomos
  const completedMissing = db
    .prepare(`
      SELECT s.id, s.name, s.total_volumes as total, COUNT(uv.id) as owned
      FROM user_series us
      JOIN series s ON s.id = us.series_id
      LEFT JOIN user_volumes uv ON uv.series_id = s.id
      WHERE us.status = 'following' AND s.is_complete = 1
      GROUP BY s.id
      HAVING s.total_volumes > 0 AND owned < s.total_volumes
      ORDER BY (s.total_volumes - owned) DESC, s.name ASC
      LIMIT 20
    `)
    .all()
    .map((r) => ({ ...r, missing: r.total - r.owned }));

  // Mejor mes (más compras)
  const bestMonth = purchasesByMonth.reduce(
    (best, m) => (m.count > (best?.count || 0) ? m : best),
    null
  );
  const busiestDay = purchasesByDay.reduce(
    (best, d) => (d.count > (best?.count || 0) ? d : best),
    null
  );

  res.json({
    summary,
    byEditorial,
    byReadingDirection,
    purchasesByMonth,
    purchasesByDay,
    purchasesByWeekday,
    topSeries,
    completedList,
    completedMissing,
    milestones: {
      bestMonth,
      busiestDay,
      activeMonths: purchasesByMonth.length,
      avgPerMonth:
        purchasesByMonth.length > 0
          ? Math.round((spend.count / purchasesByMonth.length) * 10) / 10
          : 0
    }
  });
}
