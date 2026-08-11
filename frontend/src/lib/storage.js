export const SNAPSHOT_KEY = 'lm.snapshot';
export const OUTBOX_KEY = 'lm.outbox';

function defaultStore() {
  return typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
}

function readJson(key, fallback, store) {
  try {
    const raw = (store ?? defaultStore())?.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    // JSON a medias o almacenamiento inaccesible: se empieza de cero en vez de
    // impedir que la app arranque.
    return fallback;
  }
}

function writeJson(key, value, store) {
  try {
    (store ?? defaultStore())?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Cuota llena o modo privado: no es motivo para romper la app.
    return false;
  }
}

// Un snapshot sirve solo si trae las cuatro colecciones. Uno a medias haría
// que las pantallas fallasen de formas raras más adelante.
export function isValidSnapshot(value) {
  return Boolean(
    value &&
    Array.isArray(value.series) &&
    Array.isArray(value.volumes) &&
    Array.isArray(value.owned) &&
    Array.isArray(value.wishlist)
  );
}

export function readSnapshot(store) {
  const snap = readJson(SNAPSHOT_KEY, null, store);
  return isValidSnapshot(snap) ? snap : null;
}

export function writeSnapshot(snapshot, store) {
  return writeJson(SNAPSHOT_KEY, snapshot, store);
}

export function readOutbox(store) {
  const ops = readJson(OUTBOX_KEY, [], store);
  return Array.isArray(ops) ? ops : [];
}

export function writeOutbox(ops, store) {
  return writeJson(OUTBOX_KEY, ops, store);
}
