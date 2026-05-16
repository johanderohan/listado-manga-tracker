import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.DB_PATH || join(__dirname, '../../../data/manga.db');
const db = new Database(dbPath);

// Función para escapar campos CSV
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Si contiene comas, comillas o saltos de línea, envolver en comillas
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Función para convertir array de objetos a CSV
function arrayToCSV(data, headers) {
  const headerRow = headers.map(h => escapeCSV(h)).join(',');
  const rows = data.map(row =>
    headers.map(h => escapeCSV(row[h])).join(',')
  );
  return [headerRow, ...rows].join('\n');
}

console.log('🔍 Exportando colección de manga...\n');

// Query principal: obtener todas las series que el usuario sigue con sus tomos
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
    s.is_complete as serie_completa,
    s.reading_direction as sentido_lectura,
    v.number as tomo_numero,
    v.pages as paginas,
    v.price as precio,
    v.release_date as fecha_lanzamiento,
    v.is_released as publicado,
    CASE WHEN uv.volume_number IS NOT NULL THEN 'Sí' ELSE 'No' END as tengo,
    us.status as estado_seguimiento,
    us.added_at as fecha_agregada
  FROM user_series us
  INNER JOIN series s ON us.series_id = s.id
  LEFT JOIN volumes v ON s.id = v.series_id
  LEFT JOIN user_volumes uv ON s.id = uv.series_id AND v.number = uv.volume_number
  ORDER BY s.name, v.number
`;

const rows = db.prepare(query).all();

if (rows.length === 0) {
  console.log('⚠️  No hay series en tu colección.');
  process.exit(0);
}

// Headers para el CSV
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
  'tomo_numero',
  'paginas',
  'precio',
  'fecha_lanzamiento',
  'publicado',
  'tengo',
  'estado_seguimiento',
  'fecha_agregada'
];

// Generar CSV
const csv = arrayToCSV(rows, headers);

// Guardar archivo
const exportsDir = process.env.EXPORTS_PATH || join(__dirname, '../../../exports');
const outputPath = join(exportsDir, 'mi-coleccion.csv');

// Crear directorio exports si no existe
import { mkdirSync } from 'fs';
try {
  mkdirSync(exportsDir, { recursive: true });
} catch (e) {
  // Directorio ya existe
}

writeFileSync(outputPath, '\ufeff' + csv, 'utf-8'); // \ufeff es BOM para que Excel detecte UTF-8

console.log('✅ Exportación completada!\n');
console.log(`📊 Total de registros: ${rows.length}`);

// Estadísticas
const seriesCount = new Set(rows.map(r => r.serie_id)).size;
const ownedCount = rows.filter(r => r.tengo === 'Sí').length;
const totalVolumes = rows.filter(r => r.tomo_numero !== null).length;

console.log(`📚 Series en colección: ${seriesCount}`);
console.log(`✓  Tomos que tienes: ${ownedCount} de ${totalVolumes} (${Math.round(ownedCount/totalVolumes*100)}%)`);
console.log(`\n📁 Archivo guardado en: ${outputPath}`);
console.log('\n💡 Abre el archivo con Excel, LibreOffice o Google Sheets');
