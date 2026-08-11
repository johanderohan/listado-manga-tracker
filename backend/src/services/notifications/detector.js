import { IN_SCOPE_SERIES_SQL } from '../../models/scope.js';

// Columnas comunes a los dos tipos de evento. Se comparten para que la tarjeta
// de Discord se construya siempre con la misma forma de objeto.
const EVENT_COLUMNS = `
  v.series_id,
  v.number              AS volume_number,
  v.price,
  v.pages,
  v.release_date,
  v.cover_url,
  s.name                AS series_name,
  s.author,
  s.editorial_es,
  s.url                 AS series_url,
  s.total_volumes,
  s.released_volumes,
  (SELECT COUNT(*) FROM user_volumes uv WHERE uv.series_id = v.series_id) AS owned_count,
  (SELECT COUNT(*)
     FROM volumes v2
     LEFT JOIN user_volumes uv2
       ON uv2.series_id = v2.series_id AND uv2.volume_number = v2.number
    WHERE v2.series_id = v.series_id AND v2.is_released = 1 AND uv2.id IS NULL) AS missing_count,
  EXISTS(SELECT 1 FROM wishlist w WHERE w.series_id = v.series_id) AS in_wishlist
`;

const NOT_YET_NOTIFIED = `
  NOT EXISTS (
    SELECT 1 FROM notified_volumes n
     WHERE n.series_id = v.series_id
       AND n.volume_number = v.number
       AND n.event_type = ?
  )
`;

// Tomos que han aparecido en el listado y aún no están publicados.
const ANNOUNCED_SQL = `
  SELECT ${EVENT_COLUMNS}, 'announced' AS event_type
  FROM volumes v
  JOIN series s ON s.id = v.series_id
  WHERE v.series_id IN (${IN_SCOPE_SERIES_SQL})
    AND v.is_released = 0
    AND ${NOT_YET_NOTIFIED}
  ORDER BY s.name, v.number
`;

// Tomos ya a la venta que no figuran como comprados.
const ON_SALE_SQL = `
  SELECT ${EVENT_COLUMNS}, 'on_sale' AS event_type
  FROM volumes v
  JOIN series s ON s.id = v.series_id
  WHERE v.series_id IN (${IN_SCOPE_SERIES_SQL})
    AND v.is_released = 1
    AND NOT EXISTS (
      SELECT 1 FROM user_volumes uv
       WHERE uv.series_id = v.series_id AND uv.volume_number = v.number
    )
    AND ${NOT_YET_NOTIFIED}
  ORDER BY s.name, v.number
`;

// Devuelve todo lo pendiente de avisar. Siempre mira el estado global de la BD,
// no la serie que se acabe de sincronizar: así un envío que falló ayer se
// recupera en la siguiente llamada, venga de donde venga.
export function findPendingEvents(database) {
  const announced = database.prepare(ANNOUNCED_SQL).all('announced');
  const onSale = database.prepare(ON_SALE_SQL).all('on_sale');
  return [...announced, ...onSale];
}

export function markNotified(database, events) {
  if (events.length === 0) return;

  const insert = database.prepare(`
    INSERT OR IGNORE INTO notified_volumes (series_id, volume_number, event_type)
    VALUES (?, ?, ?)
  `);

  const markAll = database.transaction((rows) => {
    for (const e of rows) insert.run(e.series_id, e.volume_number, e.event_type);
  });

  markAll(events);
}

// Registra los tomos actuales de una serie como ya avisados, sin enviar nada.
// Se usa al empezar a seguir una serie: añadir una de 40 tomos no debe
// disparar 40 tarjetas.
export function markSeriesBaseline(database, seriesId) {
  const baseline = database.transaction(() => {
    database.prepare(`
      INSERT OR IGNORE INTO notified_volumes (series_id, volume_number, event_type)
      SELECT series_id, number, 'announced' FROM volumes WHERE series_id = ?
    `).run(seriesId);

    database.prepare(`
      INSERT OR IGNORE INTO notified_volumes (series_id, volume_number, event_type)
      SELECT series_id, number, 'on_sale' FROM volumes WHERE series_id = ? AND is_released = 1
    `).run(seriesId);
  });

  baseline();
}
