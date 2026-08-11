// Los dos tipos de aviso se distinguen a golpe de vista: color de barra,
// cabecera, tamaño de portada y campos.
export const COLOR_ANNOUNCED = 0xf59e0b; // ámbar
export const COLOR_ON_SALE = 0x22c55e;   // verde

export function formatPrice(price) {
  if (!price || price <= 0) return null;
  return `${price.toFixed(2).replace('.', ',')} €`;
}

function field(name, value, inline = true) {
  if (value === null || value === undefined || value === '') return null;
  return { name, value: String(value), inline };
}

// 'Tienes 8 de 9 tomos'. Si la serie no tiene total conocido no se muestra:
// un '8 de 0' quedaría absurdo.
function collectionField(event) {
  const total = event.total_volumes || event.released_volumes;
  if (!total) return null;
  return field('Tu colección', `Tienes ${event.owned_count} de ${total} tomos`, false);
}

function pendingField(event) {
  if (!event.missing_count) return null;
  const plural = event.missing_count === 1 ? 'tomo' : 'tomos';
  return field('Pendiente', `Te faltan ${event.missing_count} ${plural} de esta serie`, false);
}

function footer(event) {
  const parts = [];
  if (event.author) parts.push(event.author);
  if (event.in_wishlist) parts.push('⭐ En tu wishlist');
  if (parts.length === 0) return undefined;
  return { text: parts.join(' · ') };
}

export function buildEmbed(event, { now = new Date() } = {}) {
  const isAnnounced = event.event_type === 'announced';

  const fields = isAnnounced
    ? [
        field('Editorial', event.editorial_es),
        field('Precio', formatPrice(event.price)),
        field('Salida prevista', event.release_date),
        collectionField(event)
      ]
    : [
        field('Editorial', event.editorial_es),
        field('Precio', formatPrice(event.price)),
        field('Páginas', event.pages || null),
        pendingField(event)
      ];

  const embed = {
    author: { name: isAnnounced ? '📢 Nuevo tomo anunciado' : '🛒 Ya a la venta' },
    title: `${event.series_name} #${event.volume_number}`,
    url: event.series_url,
    color: isAnnounced ? COLOR_ANNOUNCED : COLOR_ON_SALE,
    fields: fields.filter(Boolean),
    timestamp: now.toISOString()
  };

  // El anuncio lleva miniatura y el tomo a la venta portada grande: es el que
  // invita a comprar, así que se le da protagonismo visual.
  if (event.cover_url) {
    if (isAnnounced) embed.thumbnail = { url: event.cover_url };
    else embed.image = { url: event.cover_url };
  }

  const foot = footer(event);
  if (foot) embed.footer = foot;

  return embed;
}
