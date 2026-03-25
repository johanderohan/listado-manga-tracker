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

  // Función para extraer fecha de lanzamiento de un bloque de texto
  function extractReleaseDate(text) {
    // Buscar patrón de fecha en enlace: <a href="novedades.php?mes=X&ano=Y">Mes Año</a>
    const dateMatch = text.match(/<a[^>]*novedades\.php[^>]*>([^<]+)<\/a>/i);
    if (dateMatch) {
      return dateMatch[1].trim();
    }
    return null;
  }

  // Función para extraer URL de portada de un bloque
  function extractCoverUrl(block) {
    // Buscar data-portada primero (imagen de alta calidad)
    const dataPortadaMatch = block.match(/data-portada="([^"]+)"/i);
    if (dataPortadaMatch) {
      return `https://static.listadomanga.com/${dataPortadaMatch[1]}`;
    }
    // Buscar src de imagen
    const srcMatch = block.match(/src="(https:\/\/static\.listadomanga\.com\/[^"]+)"/i);
    if (srcMatch) {
      return srcMatch[1];
    }
    return null;
  }

  // Función para extraer volúmenes de una sección del HTML
  function extractVolumesFromSection(sectionHtml, isReleased) {
    // Dividir por cada bloque de volumen (ventana_id seguido de cualquier dígito)
    const volumeBlocks = sectionHtml.split(/class="ventana_id\d+"/gi);

    for (const block of volumeBlocks) {
      // Buscar número de volumen
      const numMatch = block.match(/n(?:º|&ordm;)\s*(\d+)/i);
      if (!numMatch) continue;

      const volumeNum = parseInt(numMatch[1]);
      if (isNaN(volumeNum) || seenVolumes.has(volumeNum)) continue;

      // Extraer páginas
      const pagesMatch = block.match(/(\d+)\s*p[aá]ginas/i);
      const pages = pagesMatch ? parseInt(pagesMatch[1]) : 0;

      // Extraer precio
      const priceMatch = block.match(/(\d+,\d+)\s*€/);
      const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0;

      // Extraer fecha de lanzamiento
      const releaseDate = extractReleaseDate(block);

      // Extraer portada del mismo bloque
      const coverUrl = extractCoverUrl(block);

      seenVolumes.add(volumeNum);
      volumes.push({
        series_id: seriesId,
        number: volumeNum,
        pages,
        price,
        is_released: isReleased,
        release_date: releaseDate,
        cover_url: coverUrl
      });
    }

    // Si no se encontraron volúmenes con el método anterior, usar patrón simple
    if (volumes.filter(v => v.is_released === isReleased).length === 0) {
      const simplePattern = /n(?:º|&ordm;)\s*0?(\d+)/gi;
      let simpleMatch;
      while ((simpleMatch = simplePattern.exec(sectionHtml)) !== null) {
        const volumeNum = parseInt(simpleMatch[1]);
        if (volumeNum && !seenVolumes.has(volumeNum)) {
          seenVolumes.add(volumeNum);
          volumes.push({ series_id: seriesId, number: volumeNum, pages: 0, price: 0, is_released: isReleased, release_date: null, cover_url: null });
        }
      }
    }

    // Patrón para tomos únicos sin número (ej: "Serie 400 páginas")
    if (volumes.filter(v => v.is_released === isReleased).length === 0 || seenVolumes.size === 0) {
      const singleVolumePattern = /(\d+)\s*p[aá]ginas/gi;
      let singleMatch;
      while ((singleMatch = singleVolumePattern.exec(sectionHtml)) !== null) {
        const pages = parseInt(singleMatch[1]);
        if (!seenVolumes.has(1) && pages >= 50) {
          seenVolumes.add(1);
          const priceMatch = sectionHtml.match(/(\d+,\d+)\s*€/);
          const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0;
          const releaseDate = extractReleaseDate(sectionHtml);
          const coverUrl = extractCoverUrl(sectionHtml);
          volumes.push({ series_id: seriesId, number: 1, pages, price, is_released: isReleased, release_date: releaseDate, cover_url: coverUrl });
          break;
        }
      }
    }

    // Último recurso: tomo único solo con precio (sin páginas ni número)
    if (volumes.filter(v => v.is_released === isReleased).length === 0 && !seenVolumes.has(1)) {
      const priceMatch = sectionHtml.match(/(\d+,\d+)\s*€/);
      if (priceMatch) {
        seenVolumes.add(1);
        const price = parseFloat(priceMatch[1].replace(',', '.'));
        const releaseDate = extractReleaseDate(sectionHtml);
        const coverUrl = extractCoverUrl(sectionHtml);
        volumes.push({ series_id: seriesId, number: 1, pages: 0, price, is_released: isReleased, release_date: releaseDate, cover_url: coverUrl });
      }
    }

    // Último último recurso: tomo único solo con fecha (sin páginas, precio ni número)
    if (volumes.filter(v => v.is_released === isReleased).length === 0 && !seenVolumes.has(1)) {
      const releaseDate = extractReleaseDate(sectionHtml);
      const coverUrl = extractCoverUrl(sectionHtml);
      // Si hay fecha o portada, asumir que es un tomo único
      if (releaseDate || coverUrl) {
        seenVolumes.add(1);
        volumes.push({ series_id: seriesId, number: 1, pages: 0, price: 0, is_released: isReleased, release_date: releaseDate, cover_url: coverUrl });
      }
    }
  }

  // Buscar secciones por h2
  let currentSection = '';
  const bodyHtml = $('body').html();

  // Dividir por secciones usando los h2 (puede incluir nombre de editorial en paréntesis)
  const editadosMatches = [...bodyHtml.matchAll(/N[uú]meros editados[^<]*<\/h2>([\s\S]*?)(?=<h2>|$)/gi)];
  const preparacionMatch = bodyHtml.match(/N[uú]meros en preparaci[oó]n[^<]*<\/h2>([\s\S]*?)(?=<h2>|$)/i);
  const noEditadosMatch = bodyHtml.match(/N[uú]meros no editados[^<]*<\/h2>([\s\S]*?)(?=<h2>|$)/i);

  // Extraer de cada sección con su estado correspondiente
  for (const match of editadosMatches) extractVolumesFromSection(match[1], 1);
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
