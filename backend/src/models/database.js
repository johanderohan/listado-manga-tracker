import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.DB_PATH || join(__dirname, '../../data.db');
const db = new Database(dbPath);

export function initDatabase() {
  db.exec(`
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

    -- Índices para mejorar rendimiento
    CREATE INDEX IF NOT EXISTS idx_volumes_series ON volumes(series_id);
    CREATE INDEX IF NOT EXISTS idx_user_volumes_series ON user_volumes(series_id);
  `);

  // Migraciones para tablas existentes
  try {
    db.exec(`ALTER TABLE volumes ADD COLUMN is_released INTEGER DEFAULT 1`);
  } catch (e) {
    // Columna ya existe
  }

  try {
    db.exec(`ALTER TABLE series ADD COLUMN released_volumes INTEGER DEFAULT 0`);
  } catch (e) {
    // Columna ya existe
  }

  try {
    db.exec(`ALTER TABLE series ADD COLUMN synopsis TEXT`);
  } catch (e) {
    // Columna ya existe
  }

  console.log('Base de datos inicializada');
}

export default db;
