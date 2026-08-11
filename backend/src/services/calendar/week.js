const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function toIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// La semana que toca anunciar. El domingo (día de envío) es la que empieza
// mañana; el lunes es la que empieza hoy, para que la recuperación tras un
// reinicio siga hablando de la misma semana.
export function announcedWeek(now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const dow = start.getDay(); // 0 = domingo, 1 = lunes
  start.setDate(start.getDate() + (dow === 1 ? 0 : (8 - dow) % 7));

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end, startIso: toIso(start), endIso: toIso(end) };
}

// calendario.php es mensual: una semana a caballo del cambio de mes obliga a
// pedir las dos páginas.
export function monthsForWindow({ start, end }) {
  const meses = [{ mes: start.getMonth() + 1, ano: start.getFullYear() }];
  if (start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear()) {
    meses.push({ mes: end.getMonth() + 1, ano: end.getFullYear() });
  }
  return meses;
}

export function formatRange({ start, end }) {
  const mesInicio = MESES[start.getMonth()];
  const mesFin = MESES[end.getMonth()];

  if (mesInicio === mesFin) {
    return `del ${start.getDate()} al ${end.getDate()} de ${mesFin}`;
  }
  return `del ${start.getDate()} de ${mesInicio} al ${end.getDate()} de ${mesFin}`;
}

export function formatShortDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DIAS_CORTOS[date.getDay()]} ${date.getDate()}`;
}

export function msUntilNextSunday(now, hour) {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);

  let dias = (7 - next.getDay()) % 7;
  if (dias === 0 && next <= now) dias = 7;
  next.setDate(next.getDate() + dias);

  return next.getTime() - now.getTime();
}

// Si el NAS estaba apagado el domingo a las 19:00, el resumen sale al arrancar
// mientras siga siendo la misma semana. Pasado el lunes ya no compensa.
export function isCatchUpWindow(now) {
  const dow = now.getDay();
  if (dow === 0) return now.getHours() >= 19;
  return dow === 1;
}
