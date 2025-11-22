import db from '../models/database.js';
import { scrapeSeriesDetail } from './scraper.js';

// Intervalo de actualización: cada 24 horas (en milisegundos)
const UPDATE_INTERVAL = 24 * 60 * 60 * 1000;

// Delay entre peticiones para no sobrecargar el servidor (2 segundos)
const REQUEST_DELAY = 2000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateAllUserSeries() {
  console.log(`[CRON] Iniciando actualización de series - ${new Date().toISOString()}`);

  const userSeries = db.prepare(`
    SELECT us.series_id, s.name
    FROM user_series us
    LEFT JOIN series s ON s.id = us.series_id
  `).all();

  if (userSeries.length === 0) {
    console.log('[CRON] No hay series para actualizar');
    return;
  }

  console.log(`[CRON] Actualizando ${userSeries.length} series...`);

  let updated = 0;
  let newVolumes = 0;
  let errors = 0;

  for (const { series_id, name } of userSeries) {
    try {
      // Contar tomos anteriores
      const oldCount = db.prepare('SELECT COUNT(*) as count FROM volumes WHERE series_id = ?').get(series_id).count;

      // Hacer scraping
      const scrapedData = await scrapeSeriesDetail(series_id);

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
      const diff = newCount - oldCount;

      if (diff > 0) {
        console.log(`[CRON] ${name}: +${diff} tomos nuevos`);
        newVolumes += diff;
      }

      updated++;

      // Esperar entre peticiones
      await sleep(REQUEST_DELAY);

    } catch (err) {
      console.error(`[CRON] Error actualizando serie ${series_id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`[CRON] Actualización completada: ${updated} series, ${newVolumes} tomos nuevos, ${errors} errores`);
}

export function startCronJob() {
  console.log('[CRON] Servicio de actualización iniciado');
  console.log(`[CRON] Próxima actualización en 24 horas`);

  // Ejecutar la primera actualización después de 1 minuto (para dar tiempo a que el servidor arranque)
  setTimeout(() => {
    updateAllUserSeries();
  }, 60 * 1000);

  // Programar actualizaciones cada 24 horas
  setInterval(() => {
    updateAllUserSeries();
  }, UPDATE_INTERVAL);
}

// Función para ejecutar actualización manual (usada por el endpoint)
export { updateAllUserSeries };
