// Utilidades de validación/saneamiento de entrada. Lanzan ValidationError
// (→ 400 en errorHandler) ante entradas claramente inválidas, sin rechazar
// las entradas válidas que ya enviaba el cliente.

export function pickAllowed(source, allowed) {
  const out = {};
  for (const key of allowed) {
    if (source && source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.name = 'ValidationError';
  return err;
}

export function toInt(value, field) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n)) throw badRequest(`Parámetro inválido: ${field}`);
  return n;
}

export function toIntInRange(value, field, min, max, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n)) throw badRequest(`Parámetro inválido: ${field}`);
  return Math.min(max, Math.max(min, n));
}

export function toIntArray(value, field) {
  if (!Array.isArray(value)) throw badRequest(`Parámetro inválido: ${field}`);
  return value.map((v) => toInt(v, field));
}
