import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.DB_PATH || join(__dirname, '../../../data/manga.db');
const db = new Database(dbPath);

// Función para escapar campos CSV
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function arrayToCSV(data, headers) {
  const headerRow = headers.map(h => escapeCSV(h)).join(',');
  const rows = data.map(row =>
    headers.map(h => escapeCSV(row[h])).join(',')
  );
  return [headerRow, ...rows].join('\n');
}

console.log('🔍 Exportando resumen de colección...\n');

// Query: resumen por serie
const query = `
  SELECT
    s.id as serie_id,
    s.name as serie_nombre,
    s.original_name as serie_nombre_original,
    s.author as autor,
    s.artist as artista,
    s.editorial_es as editorial,
    s.total_volumes as total_tomos,
    s.released_volumes as tomos_publicados,
    CASE WHEN s.is_complete = 1 THEN 'Sí' ELSE 'No' END as serie_completa,
    s.reading_direction as sentido_lectura,
    COUNT(DISTINCT uv.volume_number) as tomos_que_tengo,
    COUNT(DISTINCT v.number) as tomos_disponibles,
    ROUND(CAST(COUNT(DISTINCT uv.volume_number) AS FLOAT) / NULLIF(COUNT(DISTINCT v.number), 0) * 100, 1) as porcentaje_completado,
    GROUP_CONCAT(DISTINCT uv.volume_number ORDER BY uv.volume_number) as tomos_comprados,
    us.status as estado,
    us.added_at as fecha_agregada,
    CASE WHEN w.series_id IS NOT NULL THEN 'Sí' ELSE 'No' END as en_wishlist
  FROM user_series us
  INNER JOIN series s ON us.series_id = s.id
  LEFT JOIN volumes v ON s.id = v.series_id AND v.is_released = 1
  LEFT JOIN user_volumes uv ON s.id = uv.series_id
  LEFT JOIN wishlist w ON s.id = w.series_id
  GROUP BY s.id, s.name, s.original_name, s.author, s.artist, s.editorial_es,
           s.total_volumes, s.released_volumes, s.is_complete, s.reading_direction,
           us.status, us.added_at, w.series_id
  ORDER BY s.name
`;

const rows = db.prepare(query).all();

if (rows.length === 0) {
  console.log('⚠️  No hay series en tu colección.');
  process.exit(0);
}

const headers = [
  'serie_id',
  'serie_nombre',
  'serie_nombre_original',
  'autor',
  'artista',
  'editorial',
  'total_tomos',
  'tomos_publicados',
  'serie_completa',
  'sentido_lectura',
  'tomos_que_tengo',
  'tomos_disponibles',
  'porcentaje_completado',
  'tomos_comprados',
  'estado',
  'fecha_agregada',
  'en_wishlist'
];

const csv = arrayToCSV(rows, headers);

// Crear directorio exports si no existe
const exportsDir = process.env.EXPORTS_PATH || join(__dirname, '../../../exports');
try {
  mkdirSync(exportsDir, { recursive: true });
} catch (e) {
  // Directorio ya existe
}

const outputPath = join(exportsDir, 'mi-coleccion-resumen.csv');
writeFileSync(outputPath, '\ufeff' + csv, 'utf-8');

console.log('✅ Exportación completada!\n');
console.log(`📊 Total de series: ${rows.length}`);

const totalOwned = rows.reduce((sum, r) => sum + r.tomos_que_tengo, 0);
const totalAvailable = rows.reduce((sum, r) => sum + r.tomos_disponibles, 0);
const completeCollections = rows.filter(r => r.porcentaje_completado === 100).length;

console.log(`✓  Tomos totales: ${totalOwned} de ${totalAvailable} (${Math.round(totalOwned/totalAvailable*100)}%)`);
console.log(`📚 Colecciones completas: ${completeCollections} de ${rows.length}`);
console.log(`\n📁 Archivo guardado en: ${outputPath}`);
console.log('\n💡 Abre el archivo con Excel, LibreOffice o Google Sheets');
