// Límite de Discord: 10 embeds por mensaje.
export const MAX_EMBEDS_PER_MESSAGE = 10;

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Envía un mensaje y espera confirmación. El '?wait=true' hace que Discord
// responda con el mensaje ya creado en vez del 204 a ciegas de siempre: sin esa
// confirmación no se marca nada como notificado.
export async function sendMessage({ embeds, content }, {
  webhookUrl = process.env.DISCORD_WEBHOOK_URL,
  fetchImpl = fetch,
  sleepImpl = sleep,
  maxRetries = 3
} = {}) {
  if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL no está definida');

  const body = JSON.stringify(content ? { content, embeds } : { embeds });
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchImpl(`${webhookUrl}?wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      if (res.ok) {
        const message = await res.json();
        return message.id;
      }

      // Rate limit: Discord dice cuántos segundos hay que esperar.
      if (res.status === 429) {
        const { retry_after: retryAfter = 1 } = await res.json();
        await sleepImpl(Math.ceil(retryAfter * 1000));
        continue;
      }

      // Un 4xx que no sea 429 es culpa del mensaje, no de la red: reintentar
      // no arregla nada.
      if (res.status < 500) {
        const detail = await res.text();
        throw new Error(`Discord respondió ${res.status}: ${detail}`);
      }

      lastError = new Error(`Discord respondió ${res.status}`);
    } catch (err) {
      if (/^Discord respondió 4/.test(err.message)) throw err;
      lastError = err;
    }

    if (attempt < maxRetries) await sleepImpl(1000 * 2 ** (attempt - 1));
  }

  throw lastError;
}
