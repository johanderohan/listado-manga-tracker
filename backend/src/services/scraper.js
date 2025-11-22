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

  const volumes = [];
  const seenVolumes = new Set();

  // Función para extraer número de tomo del texto combinado
  function parseVolumeNumber(combinedNum) {
    if (combinedNum.length <= 3) {
      return { volumeNum: parseInt(combinedNum), pages: 0 };
    }
    const maxTomoDigits = Math.min(3, combinedNum.length - 3);
    for (let i = maxTomoDigits; i >= 1; i--) {
      const possibleVolume = parseInt(combinedNum.slice(0, i));
      const possiblePages = parseInt(combinedNum.slice(i));
      if (possiblePages >= 100 && possiblePages <= 500 && possibleVolume <= 200) {
        return { volumeNum: possibleVolume, pages: possiblePages };
      }
    }
    return { volumeNum: parseInt(combinedNum.slice(0, 1)), pages: parseInt(combinedNum.slice(1)) || 0 };
  }

  // Función para extraer volúmenes de una sección del HTML
  function extractVolumesFromSection(sectionHtml, isReleased) {
    // Patrón para volúmenes con número y precio
    const volumePattern = /nº\s*0?(\d+)[\s\S]*?(\d+)\s*páginas[\s\S]*?(\d+,\d+)\s*€/gi;
    let match;
    while ((match = volumePattern.exec(sectionHtml)) !== null) {
      const volumeNum = parseInt(match[1]);
      const pages = parseInt(match[2]);
      const price = parseFloat(match[3].replace(',', '.'));
      if (volumeNum && !seenVolumes.has(volumeNum)) {
        seenVolumes.add(volumeNum);
        volumes.push({ series_id: seriesId, number: volumeNum, pages, price, is_released: isReleased });
      }
    }

    // Patrón para volúmenes con número pero sin precio
    const noPricePattern = /nº\s*0?(\d+)[\s\S]*?(\d+)\s*páginas(?![\s\S]*?€)/gi;
    let noPriceMatch;
    while ((noPriceMatch = noPricePattern.exec(sectionHtml)) !== null) {
      const volumeNum = parseInt(noPriceMatch[1]);
      const pages = parseInt(noPriceMatch[2]);
      if (volumeNum && !seenVolumes.has(volumeNum)) {
        seenVolumes.add(volumeNum);
        volumes.push({ series_id: seriesId, number: volumeNum, pages, price: 0, is_released: isReleased });
      }
    }

    // Patrón para tomos únicos sin número (ej: "Serie<br/>400 páginas")
    // Solo si no hay volúmenes encontrados aún en esta sección
    if (volumes.filter(v => v.is_released === isReleased).length === 0 || seenVolumes.size === 0) {
      const singleVolumePattern = /(\d+)\s*páginas/gi;
      let singleMatch;
      while ((singleMatch = singleVolumePattern.exec(sectionHtml)) !== null) {
        const pages = parseInt(singleMatch[1]);
        if (!seenVolumes.has(1) && pages >= 50) {
          seenVolumes.add(1);
          // Buscar precio cercano
          const priceMatch = sectionHtml.match(/(\d+,\d+)\s*€/);
          const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0;
          volumes.push({ series_id: seriesId, number: 1, pages, price, is_released: isReleased });
          break;
        }
      }
    }

    // Patrón para tomo único sin número pero con precio
    if (volumes.filter(v => v.is_released === isReleased).length === 0 || seenVolumes.size === 0) {
      const singleVolumeWithPricePattern = /(\d+,\d+)\s*€/gi;
      let singleMatch;
      while ((singleMatch = singleVolumeWithPricePattern.exec(sectionHtml)) !== null) {
        if (!seenVolumes.has(1)) {
          seenVolumes.add(1);
          const price = parseFloat(singleMatch[1].replace(',', '.'));
          volumes.push({ series_id: seriesId, number: 1, pages: 0, price, is_released: isReleased });
          break;
        }
      }
    }

    // Buscar volúmenes simples sin precio ni páginas (no editados)
    const simplePattern = /nº\s*0?(\d+)(?![\s\S]*?páginas)/gi;
    let simpleMatch;
    while ((simpleMatch = simplePattern.exec(sectionHtml)) !== null) {
      const volumeNum = parseInt(simpleMatch[1]);
      if (volumeNum && !seenVolumes.has(volumeNum)) {
        seenVolumes.add(volumeNum);
        volumes.push({ series_id: seriesId, number: volumeNum, pages: 0, price: 0, is_released: isReleased });
      }
    }
  }

  // Buscar secciones por h2
  let currentSection = '';
  const bodyHtml = $('body').html();

  // Dividir por secciones usando los h2
  const editadosMatch = bodyHtml.match(/Números editados<\/h2>([\s\S]*?)(?=<h2>|$)/i);
  const preparacionMatch = bodyHtml.match(/Números en preparación<\/h2>([\s\S]*?)(?=<h2>|$)/i);
  const noEditadosMatch = bodyHtml.match(/Números no editados<\/h2>([\s\S]*?)(?=<h2>|$)/i);

  // Extraer de cada sección con su estado correspondiente
  if (editadosMatch) extractVolumesFromSection(editadosMatch[1], 1);
  if (preparacionMatch) extractVolumesFromSection(preparacionMatch[1], 0);
  if (noEditadosMatch) extractVolumesFromSection(noEditadosMatch[1], 0);

  // Contar solo los editados (publicados)
  const releasedCount = volumes.filter(v => v.is_released === 1).length;

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
