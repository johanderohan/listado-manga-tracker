import db from '../config/db.js';
import { scrapeSeriesDetail } from './scraper.js';
import {
  upsertScrapedSeries,
  replaceVolumes,
  countVolumes,
  setLastRefresh
} from './seriesSync.service.js';
import { notifyNewReleases } from './notifications/index.js';
import { sendWeeklyDigest } from './calendar/index.js';
import { msUntilNextSunday, isCatchUpWindow } from './calendar/week.js';

// Hora de actualización diaria (7:00 AM)
const UPDATE_HOUR = 7;
const UPDATE_MINUTE = 0;

// Delay entre peticiones para no sobrecargar el servidor (2 segundos)
const REQUEST_DELAY = 2000;

// Calcula los milisegundos hasta la próxima hora programada
function getMillisecondsUntilNextRun() {
  const now = new Date();
  const next = new Date();

  next.setHours(UPDATE_HOUR, UPDATE_MINUTE, 0, 0);

  // Si ya pasó la hora de hoy, programar para mañana
  if (now >= next) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateAllUserSeries() {
  console.log(`[CRON] Iniciando actualización de series - ${new Date().toISOString()}`);

  // Se refrescan todas las series del usuario (siguiendo y descartadas, como
  // hasta ahora) más las de la wishlist, que hasta ahora no se actualizaban
  // nunca porque el bucle solo miraba user_series.
  const userSeries = db.prepare(`
    SELECT us.series_id AS series_id, s.name AS name
    FROM user_series us
    LEFT JOIN series s ON s.id = us.series_id
    UNION
    SELECT w.series_id AS series_id, s.name AS name
    FROM wishlist w
    LEFT JOIN series s ON s.id = w.series_id
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
      const oldCount = countVolumes(series_id);

      // Hacer scraping
      const scrapedData = await scrapeSeriesDetail(series_id);

      // Actualizar serie y volúmenes
      upsertScrapedSeries(scrapedData, series_id);
      replaceVolumes(series_id, scrapedData.volumes);

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

  // Guardar fecha de última actualización
  setLastRefresh();

  await notifyNewReleases();

  console.log(`[CRON] Actualización completada: ${updated} series, ${newVolumes} tomos nuevos, ${errors} errores`);
}

function scheduleNextRun() {
  const msUntilNext = getMillisecondsUntilNextRun();
  const nextRun = new Date(Date.now() + msUntilNext);

  console.log(`[CRON] Próxima actualización programada: ${nextRun.toLocaleString('es-ES')}`);

  setTimeout(async () => {
    await updateAllUserSeries();
    // Después de ejecutar, programar la siguiente (mañana a las 7 AM)
    scheduleNextRun();
  }, msUntilNext);
}

// Resumen semanal del calendario: domingos a las 19:00.
const DIGEST_HOUR = 19;

function scheduleWeeklyDigest() {
  const ms = msUntilNextSunday(new Date(), DIGEST_HOUR);
  console.log(`[SEMANAL] Próximo resumen: ${new Date(Date.now() + ms).toLocaleString('es-ES')}`);

  setTimeout(async () => {
    await sendWeeklyDigest();
    scheduleWeeklyDigest();
  }, ms);
}

export function startCronJob() {
  console.log('[CRON] Servicio de actualización iniciado');
  console.log(`[CRON] Actualización diaria programada a las ${UPDATE_HOUR}:${String(UPDATE_MINUTE).padStart(2, '0')}`);

  // Programar la primera ejecución a las 7 AM
  scheduleNextRun();

  scheduleWeeklyDigest();

  // Si el contenedor estaba parado el domingo a las 19:00, el resumen sale
  // ahora, siempre que siga siendo la misma semana. sendWeeklyDigest ya se
  // protege con la marca de app_config, así que no puede duplicar.
  if (isCatchUpWindow(new Date())) {
    sendWeeklyDigest().catch(err => console.error(`[SEMANAL] ${err.message}`));
  }
}

// Función para ejecutar actualización manual (usada por el endpoint)
export { updateAllUserSeries };
