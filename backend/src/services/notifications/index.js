import db from '../../config/db.js';
import { findPendingEvents, markNotified, markSeriesBaseline } from './detector.js';
import { buildEmbed } from './embeds.js';
import { chunk, sendMessage, sleep, MAX_EMBEDS_PER_MESSAGE } from './discord.js';

const DEFAULT_DELAY_MS = 1500;
const DEFAULT_MAX_PER_RUN = 30;

// El aviso se dispara en cualquier actualización, y refrescar todo tarda
// minutos: este cerrojo evita que dos ejecuciones solapadas manden lo mismo
// dos veces.
let running = false;

export async function notifyNewReleases({
  database = db,
  webhookUrl = process.env.DISCORD_WEBHOOK_URL,
  sendImpl = sendMessage,
  sleepImpl = sleep,
  delayMs = Number(process.env.DISCORD_SEND_DELAY_MS) || DEFAULT_DELAY_MS,
  maxPerRun = Number(process.env.DISCORD_MAX_EMBEDS_PER_RUN) || DEFAULT_MAX_PER_RUN
} = {}) {
  if (!webhookUrl) return { sent: 0, pending: 0, skipped: true };
  if (running) return { sent: 0, pending: 0, skipped: true };

  running = true;
  try {
    const all = findPendingEvents(database);
    if (all.length === 0) return { sent: 0, pending: 0 };

    const events = all.slice(0, maxPerRun);
    const overflow = all.length - events.length;
    const batches = chunk(events, MAX_EMBEDS_PER_MESSAGE);

    let sent = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const isLast = i === batches.length - 1;
      const content = isLast && overflow > 0 ? `…y otros ${overflow} tomos más` : undefined;

      try {
        await sendImpl({ embeds: batch.map(e => buildEmbed(e)), content }, { webhookUrl });
      } catch (err) {
        // Lo no enviado se queda sin marcar y sale en la próxima ejecución.
        console.error(`[NOTIF] Fallo al enviar a Discord: ${err.message}`);
        break;
      }

      markNotified(database, batch);
      sent += batch.length;

      if (!isLast) await sleepImpl(delayMs);
    }

    if (sent > 0) console.log(`[NOTIF] ${sent} novedades enviadas a Discord`);

    return { sent, pending: all.length - sent };
  } finally {
    running = false;
  }
}

// Para los endpoints HTTP: notificar no debe hacer esperar a la respuesta.
export function notifyNewReleasesInBackground() {
  notifyNewReleases().catch(err => console.error(`[NOTIF] ${err.message}`));
}

export function markSeriesAsBaseline(seriesId, database = db) {
  markSeriesBaseline(database, seriesId);
}
