// Capa de acceso a datos. La implementación real (SQLite + better-sqlite3 +
// initDatabase) vive en models/database.js, compartida también por los
// scripts de exportación (que no se modifican). Este módulo expone el patrón
// config/db.js de la arquitectura sin duplicar la conexión: reexporta el
// mismo singleton de better-sqlite3, no crea uno nuevo.
export { default, initDatabase } from '../models/database.js';
