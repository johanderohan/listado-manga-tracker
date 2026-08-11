import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.listadomanga.es';

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};

// 'Viernes, 14 Agosto 2026' → '2026-08-14'. Devuelve null si el h2 no es una
// fecha, que es como se distingue del h2 de la editorial.
function parseFecha(texto) {
  const m = texto.match(/(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(\d{4})/);
  if (!m) return null;

  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;

  return `${m[3]}-${String(mes).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

// Mapa id de serie → portada. Se construye de una pasada sobre toda la página:
// la rejilla de imágenes envuelve cada portada en un enlace a la ficha, así que
// el cruce es exacto sin depender del texto del alt.
function buildCoverMap($) {
  const covers = new Map();

  $('a[href^="coleccion.php?id="]').each((_, el) => {
    const img = $(el).find('img.portada').attr('src');
    if (!img) return;

    const id = Number($(el).attr('href').match(/id=(\d+)/)[1]);
    if (!covers.has(id)) covers.set(id, img);
  });

  return covers;
}

export function parseCalendar(html) {
  const $ = cheerio.load(html);
  const covers = buildCoverMap($);

  const entries = [];
  let totalEntries = 0;
  let editorial = '';
  let fecha = '';
  let categoria = '';

  // h2 y td.izq llegan en orden de documento, así que basta con ir arrastrando
  // la editorial, la fecha y la categoría vigentes.
  $('h2, td.izq').each((_, el) => {
    const $el = $(el);

    if ($el.is('h2')) {
      if ($el.find('a[href*="calendario.php?editorial="]').length > 0) {
        editorial = $el.text().trim();
        return;
      }
      const f = parseFecha($el.text().trim());
      if (f) fecha = f;
      return;
    }

    for (const trozo of $el.html().split(/<br\s*\/?>/i)) {
      const $t = cheerio.load(`<div>${trozo}</div>`);

      const cat = $t('b u').first().text().trim();
      if (cat) { categoria = cat; continue; }

      const $ficha = $t('a[href^="coleccion.php?id="]').first();
      if ($ficha.length === 0) continue;

      totalEntries++;

      const tipo = $t('span.nuevacoleccion').length > 0 ? 'nuevaSerie'
        : $t('span.tomounico').length > 0 ? 'unico'
        : null;
      if (!tipo) continue;

      const seriesId = Number($ficha.attr('href').match(/id=(\d+)/)[1]);

      entries.push({
        seriesId,
        titulo: $ficha.text().trim(),
        tipo,
        fecha,
        editorial,
        categoria,
        autores: $t('a[href^="autor.php"]').map((_, a) => $t(a).text().trim()).get(),
        portadaUrl: covers.get(seriesId) || null,
        url: `${BASE_URL}/coleccion.php?id=${seriesId}`
      });
    }
  });

  return { entries, totalEntries };
}
