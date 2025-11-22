import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.listadomanga.es';

async function fetchPage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.text();
}

// Obtener listado de todas las series
export async function scrapeSeriesList() {
  const html = await fetchPage(`${BASE_URL}/lista.php`);
  const $ = cheerio.load(html);
  const series = [];

  $('a[href*="coleccion.php?id="]').each((_, element) => {
    const $el = $(element);
    const href = $el.attr('href');
    const id = parseInt(href.match(/id=(\d+)/)?.[1]);
    const name = $el.text().trim();

    if (id && name) {
      series.push({ id, name, url: `${BASE_URL}/${href}` });
    }
  });

  return series;
}

// Obtener detalle de una serie específica
export async function scrapeSeriesDetail(seriesId) {
  const url = `${BASE_URL}/coleccion.php?id=${seriesId}`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const series = {
    id: seriesId,
    name: '',
    original_name: '',
    author: '',
    artist: '',
    editorial_jp: '',
    editorial_es: '',
    reading_direction: '',
    total_volumes: 0,
    is_complete: 0,
    synopsis: '',
    volumes: []
  };

  // Extraer título de la serie (preferir <title> que es más consistente)
  let title = $('title').text().trim();
  // Limpiar prefijo "Listado Manga · Colección · "
  title = title.replace(/^Listado Manga\s*·\s*Colección\s*·\s*/i, '');
  series.name = title.trim();

  // Buscar información en el contenido de la página
  const pageText = $('body').text();

  // Extraer título original del HTML
  const htmlContent = $('body').html();
  const originalMatch = htmlContent.match(/Título original:<\/b>\s*([^<]+)/i);
  if (originalMatch) series.original_name = originalMatch[1].trim();

  const authorMatch = pageText.match(/Guionista[:\s]*([^\n]+)/i);
  if (authorMatch) series.author = authorMatch[1].trim();

  // Extraer artista usando cheerio (buscar enlace después de "Dibujo:")
  $('a[href*="autor.php"]').each((_, el) => {
    const prev = $(el).parent().html();
    if (prev && (prev.includes('Dibujo:') || prev.includes('Dibujante:'))) {
      const match = prev.match(/(?:Dibujo|Dibujante):<\/b>\s*<a[^>]*>([^<]+)/i);
      if (match) series.artist = match[1].trim();
    }
  });

  // Extraer editorial española usando cheerio
  $('a[href*="editorial.php"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text && !series.editorial_es) {
      series.editorial_es = text;
    }
  });

  const readingMatch = pageText.match(/Sentido de lectura[:\s]*(Oriental|Occidental)/i);
  if (readingMatch) series.reading_direction = readingMatch[1].trim();

  // Extraer sinopsis: buscar h2 con "Sinopsis de", luego extraer texto del td padre
  $('h2').each((_, el) => {
    const h2Text = $(el).text();
    if (h2Text.toLowerCase().includes('sinopsis de')) {
      // El texto está en el mismo td, después del h2 y hr
      const td = $(el).parent();
      // Clonar el td, quitar el h2 y hr, y obtener el texto
      const tdClone = td.clone();
      tdClone.find('h2, hr').remove();
      let synopsis = tdClone.text().trim();
      // Limitar longitud
      if (synopsis.length > 500) {
        synopsis = synopsis.substring(0, 500).replace(/\s+\S*$/, '...');
      }
      series.synopsis = synopsis;
    }
  });

  // Detectar si la serie está completa (todos los tomos publicados)
  series.is_complete = pageText.toLowerCase().includes('serie completa') ? 1 : 0;

  // Extraer información de tomos EDITADOS (publicados)
  // El HTML une el número del tomo con las páginas: "nº1192 páginas" = tomo 1, 192 páginas
  const volumePattern = /nº\s*0?(\d+)\s*páginas.*?(\d+,\d+)\s*€/gi;
  let match;
  const volumes = [];
  const seenVolumes = new Set();

  while ((match = volumePattern.exec(pageText)) !== null) {
    const combinedNum = match[1];
    const price = parseFloat(match[2].replace(',', '.'));

    // Separar número de tomo y páginas
    let volumeNum, pages;

    if (combinedNum.length <= 3) {
      volumeNum = parseInt(combinedNum);
      pages = 0;
    } else {
      // Caso combinado: "nº10192" = tomo 10, 192 páginas
      const maxTomoDigits = Math.min(3, combinedNum.length - 3);
      for (let i = maxTomoDigits; i >= 1; i--) {
        const possibleVolume = parseInt(combinedNum.slice(0, i));
        const possiblePages = parseInt(combinedNum.slice(i));

        if (possiblePages >= 100 && possiblePages <= 500 && possibleVolume <= 200) {
          volumeNum = possibleVolume;
          pages = possiblePages;
          break;
        }
      }

      if (!volumeNum) {
        volumeNum = parseInt(combinedNum.slice(0, 1));
        pages = parseInt(combinedNum.slice(1)) || 0;
      }
    }

    if (volumeNum && !seenVolumes.has(volumeNum)) {
      seenVolumes.add(volumeNum);
      volumes.push({
        series_id: seriesId,
        number: volumeNum,
        pages: pages || 0,
        price,
        is_released: 1
      });
    }
  }

  // Guardar número de tomos editados
  const releasedCount = volumes.length;

  // Extraer tomos NO EDITADOS (pendientes de publicar)
  // Buscar sección "Números no editados" y capturar los números
  const unreleasedSection = pageText.match(/N[úu]meros no editados([\s\S]*?)(?:$|Colecciones relacionadas|Enlaces)/i);
  if (unreleasedSection) {
    const unreleasedText = unreleasedSection[1];
    // Buscar patrones como "nº3", "nº4", etc. (sin precio ni páginas)
    const unreleasedPattern = /nº\s*0?(\d+)(?!\d*\s*páginas)/gi;
    let unreleasedMatch;

    while ((unreleasedMatch = unreleasedPattern.exec(unreleasedText)) !== null) {
      const volumeNum = parseInt(unreleasedMatch[1]);

      if (volumeNum && !seenVolumes.has(volumeNum)) {
        seenVolumes.add(volumeNum);
        volumes.push({
          series_id: seriesId,
          number: volumeNum,
          pages: 0,
          price: 0,
          is_released: 0
        });
      }
    }
  }

  // Ordenar por número de tomo
  volumes.sort((a, b) => a.number - b.number);

  // Método alternativo si no se encontraron tomos
  if (volumes.length === 0) {
    const numMatch = pageText.match(/Números editados en España[:\s]*(\d+)/i);
    if (numMatch) {
      const totalVols = parseInt(numMatch[1]);
      for (let i = 1; i <= totalVols; i++) {
        volumes.push({
          series_id: seriesId,
          number: i,
          pages: 0,
          price: 0,
          is_released: 1
        });
      }
    }
  }

  // Extraer imágenes de portadas
  $('img[src*="static.listadomanga"]').each((index, img) => {
    const src = $(img).attr('src');
    if (volumes[index]) {
      volumes[index].cover_url = src;
    }
  });

  series.volumes = volumes;
  series.total_volumes = volumes.length;
  series.released_volumes = releasedCount;

  return series;
}

// Obtener series por categoría
export async function scrapeCategory(category) {
  const categoryUrls = {
    'manga': 'lista.php',
    'bl': 'lista.php?genero=bl',
    'yuri': 'lista.php?genero=yuri',
    'hentai': 'lista.php?genero=hentai',
    'light-novel': 'lista.php?genero=ln'
  };

  const url = `${BASE_URL}/${categoryUrls[category] || 'lista.php'}`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);
  const series = [];

  $('a[href*="coleccion.php?id="]').each((_, element) => {
    const $el = $(element);
    const href = $el.attr('href');
    const id = parseInt(href.match(/id=(\d+)/)?.[1]);
    const name = $el.text().trim();

    if (id && name) {
      series.push({ id, name, category, url: `${BASE_URL}/${href}` });
    }
  });

  return series;
}

// Buscar series por nombre
export async function searchSeries(query) {
  const html = await fetchPage(`${BASE_URL}/lista.php`);
  const $ = cheerio.load(html);
  const series = [];
  const queryLower = query.toLowerCase();

  $('a[href*="coleccion.php?id="]').each((_, element) => {
    const $el = $(element);
    const name = $el.text().trim();

    if (name.toLowerCase().includes(queryLower)) {
      const href = $el.attr('href');
      const id = parseInt(href.match(/id=(\d+)/)?.[1]);

      if (id) {
        series.push({ id, name, url: `${BASE_URL}/${href}` });
      }
    }
  });

  return series;
}
