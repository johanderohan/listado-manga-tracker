import db from '../../config/db.js';
import { sendMessage } from '../notifications/discord.js';
import { announcedWeek, monthsForWindow } from './week.js';
import { fetchMonth } from './client.js';
import { parseCalendar } from './parser.js';
import { filtrarRelevantes, enVentana, buildDigestEmbed } from './digest.js';

const CLAVE = 'last_weekly_digest';

function leerMarca(database) {
  return database.prepare('SELECT value FROM app_config WHERE key = ?').get(CLAVE)?.value;
}

function guardarMarca(database, valor) {
  database.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run(CLAVE, valor);
}

export async function sendWeeklyDigest({
  database = db,
  now = new Date(),
  webhookUrl = process.env.DISCORD_WEBHOOK_URL,
  fetchImpl = fetch,
  sendImpl = sendMessage
} = {}) {
  if (!webhookUrl) return { sent: false, count: 0, skipped: 'sin-webhook' };

  const window = announcedWeek(now);
  if (leerMarca(database) === window.startIso) {
    return { sent: false, count: 0, skipped: 'ya-enviado' };
  }

  const entries = [];
  let totalEntries = 0;

  try {
    for (const mes of monthsForWindow(window)) {
      const html = await fetchMonth(mes, { fetchImpl });
      const parsed = parseCalendar(html);
      entries.push(...parsed.entries);
      totalEntries += parsed.totalEntries;
    }
  } catch (err) {
    console.error(`[SEMANAL] Fallo al descargar el calendario: ${err.message}`);
    return { sent: false, count: 0, skipped: 'error-descarga' };
  }

  // Cero entradas dentro de la ventana es una semana floja; cero entradas en
  // todo el mes es que el parseo se ha roto. Mandar "sin novedades" en el
  // segundo caso sería mentir.
  if (totalEntries === 0) {
    console.error('[SEMANAL] El calendario no devolvió ninguna entrada: revisar el parseo');
    return { sent: false, count: 0, skipped: 'parseo-vacio' };
  }

  const seleccion = enVentana(filtrarRelevantes(entries), window);

  try {
    await sendImpl({ embeds: [buildDigestEmbed({ entries: seleccion, window, now })] }, { webhookUrl });
  } catch (err) {
    console.error(`[SEMANAL] Fallo al enviar a Discord: ${err.message}`);
    return { sent: false, count: 0, skipped: 'error-envio' };
  }

  guardarMarca(database, window.startIso);
  console.log(`[SEMANAL] Resumen enviado: ${seleccion.length} novedades ${window.startIso} → ${window.endIso}`);

  return { sent: true, count: seleccion.length };
}
