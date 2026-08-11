import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { IN_SCOPE_SERIES_SQL } from './scope.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.DB_PATH || join(__dirname, '../../data.db');
const db = new Database(dbPath);

// El DDL vive en una función que acepta cualquier handle para que los tests
// puedan levantar el mismo esquema sobre una BD en memoria.
export function createSchema(database) {
  database.exec(`
    -- Series de manga (datos scrapeados)
    CREATE TABLE IF NOT EXISTS series (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      original_name TEXT,
      author TEXT,
      artist TEXT,
      editorial_jp TEXT,
      editorial_es TEXT,
      total_volumes INTEGER,
      is_complete INTEGER DEFAULT 0,
      category TEXT,
      url TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Tomos individuales de cada serie
    CREATE TABLE IF NOT EXISTS volumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL,
      number INTEGER NOT NULL,
      title TEXT,
      pages INTEGER,
      price REAL,
      release_date TEXT,
      cover_url TEXT,
      is_released INTEGER DEFAULT 1,
      FOREIGN KEY (series_id) REFERENCES series(id),
      UNIQUE(series_id, number)
    );

    -- Series que el usuario está siguiendo
    CREATE TABLE IF NOT EXISTS user_series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL UNIQUE,
      status TEXT DEFAULT 'following',
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (series_id) REFERENCES series(id)
    );

    -- Tomos que el usuario ha comprado
    CREATE TABLE IF NOT EXISTS user_volumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL,
      volume_number INTEGER NOT NULL,
      purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (series_id) REFERENCES series(id),
      UNIQUE(series_id, volume_number)
    );

    -- Wishlist del usuario
    CREATE TABLE IF NOT EXISTS wishlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL UNIQUE,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      FOREIGN KEY (series_id) REFERENCES series(id)
    );

    -- Avisos ya enviados a Discord. Da memoria persistente a la notificación:
    -- replaceVolumes() borra y reinserta los tomos en cada sincronización, así
    -- que sin esta tabla no habría forma de saber qué es novedad de verdad.
    CREATE TABLE IF NOT EXISTS notified_volumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL,
      volume_number INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      notified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(series_id, volume_number, event_type)
    );

    -- Índices para mejorar rendimiento
    CREATE INDEX IF NOT EXISTS idx_volumes_series ON volumes(series_id);
    CREATE INDEX IF NOT EXISTS idx_user_volumes_series ON user_volumes(series_id);
    CREATE INDEX IF NOT EXISTS idx_notified_series ON notified_volumes(series_id);

    -- Configuración de la aplicación
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migraciones para tablas existentes
  const migrations = [
    `ALTER TABLE volumes ADD COLUMN is_released INTEGER DEFAULT 1`,
    `ALTER TABLE series ADD COLUMN released_volumes INTEGER DEFAULT 0`,
    `ALTER TABLE series ADD COLUMN synopsis TEXT`,
    `ALTER TABLE series ADD COLUMN reading_direction TEXT`
  ];

  for (const sql of migrations) {
    try {
      database.exec(sql);
    } catch (e) {
      // Columna ya existe
    }
  }
}

// Marca como ya avisado todo lo que hay en la BD, sin enviar nada. Se ejecuta
// una única vez: en cuanto notified_volumes tiene una fila, no vuelve a tocar
// nada. Sin esto, el primer arranque soltaría cientos de tarjetas de golpe.
export function seedNotifiedBaseline(database) {
  const already = database.prepare('SELECT COUNT(*) AS count FROM notified_volumes').get().count;
  if (already > 0) return { announced: 0, onSale: 0, total: 0 };

  const seed = database.transaction(() => {
    // 'announced' para todos los tomos, publicados o no: así un tomo ya
    // conocido nunca podrá disparar un anuncio retroactivo.
    const announced = database.prepare(`
      INSERT OR IGNORE INTO notified_volumes (series_id, volume_number, event_type)
      SELECT v.series_id, v.number, 'announced'
      FROM volumes v
      WHERE v.series_id IN (${IN_SCOPE_SERIES_SQL})
    `).run().changes;

    // 'on_sale' solo para lo ya publicado. Los tomos anunciados sin publicar
    // quedan sin marcar y avisarán cuando salgan, que es lo que se busca.
    const onSale = database.prepare(`
      INSERT OR IGNORE INTO notified_volumes (series_id, volume_number, event_type)
      SELECT v.series_id, v.number, 'on_sale'
      FROM volumes v
      WHERE v.series_id IN (${IN_SCOPE_SERIES_SQL})
        AND v.is_released = 1
    `).run().changes;

    return { announced, onSale, total: announced + onSale };
  });

  return seed();
}

export function initDatabase() {
  createSchema(db);

  const baseline = seedNotifiedBaseline(db);
  if (baseline.total > 0) {
    console.log(`[NOTIF] Línea base creada: ${baseline.announced} anunciados, ${baseline.onSale} a la venta`);
  }

  console.log('Base de datos inicializada');
}

export default db;
