import { formatRange, formatShortDay } from './week.js';

// Índigo: distinto del ámbar de los anuncios y del verde de los tomos a la
// venta, para diferenciar los tres avisos de un vistazo.
export const COLOR_DIGEST = 0x6366f1;

// Discord corta el bloque a 1024 caracteres. Con enlaces markdown cada línea
// ronda los 90, así que el límite real lo marca el presupuesto de caracteres,
// no el número de líneas: 15 líneas se pasarían de largo.
export const MAX_LINEAS_POR_BLOQUE = 15;
export const MAX_CARACTERES_BLOQUE = 1024;
export const MAX_TITULO = 60;

// Sitio reservado para la línea de cierre '…y N más'.
const RESERVA_CIERRE = 20;

// Coleccionables por fascículos: cada colección que arranca genera un nº1 que
// no es manga.
const CATEGORIAS_FUERA = /miniaturas|figuras/i;

// Duplican algo que ya se lista por su cuenta.
const TITULOS_FUERA = /\bpack\b|sobrecubierta\s+alternativa/i;

export function filtrarRelevantes(entries) {
  return entries.filter(e =>
    !CATEGORIAS_FUERA.test(e.categoria || '') && !TITULOS_FUERA.test(e.titulo || '')
  );
}

export function enVentana(entries, { startIso, endIso }) {
  return entries.filter(e => e.fecha >= startIso && e.fecha <= endIso);
}

function ordenar(entries) {
  return [...entries].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo, 'es')
  );
}

function recortar(titulo) {
  return titulo.length > MAX_TITULO ? `${titulo.slice(0, MAX_TITULO - 1)}…` : titulo;
}

function bloque(nombre, entries) {
  if (entries.length === 0) return null;

  const lineas = [];
  let largo = 0;

  for (const e of entries) {
    if (lineas.length === MAX_LINEAS_POR_BLOQUE) break;

    const linea = `• [${recortar(e.titulo)}](${e.url}) · ${e.editorial} · ${formatShortDay(e.fecha)}`;
    if (largo + linea.length + 1 > MAX_CARACTERES_BLOQUE - RESERVA_CIERRE) break;

    lineas.push(linea);
    largo += linea.length + 1;
  }

  const restantes = entries.length - lineas.length;
  if (restantes > 0) lineas.push(`…y ${restantes} más`);

  return { name: `${nombre} (${entries.length})`, value: lineas.join('\n'), inline: false };
}

export function buildDigestEmbed({ entries, window, now = new Date() }) {
  const rango = formatRange(window);

  if (entries.length === 0) {
    return {
      title: `🗓️ Sin nuevas series ni números únicos ${rango}`,
      color: COLOR_DIGEST,
      fields: [],
      timestamp: now.toISOString()
    };
  }

  const series = ordenar(entries.filter(e => e.tipo === 'nuevaSerie'));
  const unicos = ordenar(entries.filter(e => e.tipo === 'unico'));

  const embed = {
    title: `🗓️ Salidas ${rango}`,
    url: 'https://www.listadomanga.es/calendario.php',
    color: COLOR_DIGEST,
    fields: [bloque('📘 Empiezan serie', series), bloque('📗 Números únicos', unicos)].filter(Boolean),
    footer: { text: `${entries.length} novedades · listadomanga.es` },
    timestamp: now.toISOString()
  };

  const portada = [...series, ...unicos].find(e => e.portadaUrl)?.portadaUrl;
  if (portada) embed.thumbnail = { url: portada };

  return embed;
}
