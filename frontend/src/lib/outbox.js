let contador = 0;

export function crearOp(tipo, seriesId, volumeNumber, ts) {
  contador += 1;
  return { id: `${ts}-${contador}`, tipo, seriesId, volumeNumber, ts };
}

// Devuelve un snapshot nuevo: las vistas son reactivas y mutar el original
// dejaría estados a medias si algo falla después.
export function aplicarOp(snapshot, op) {
  const resto = snapshot.owned.filter(
    (o) => !(o.series_id === op.seriesId && o.volume_number === op.volumeNumber)
  );

  const owned =
    op.tipo === 'comprar'
      ? [...resto, { series_id: op.seriesId, volume_number: op.volumeNumber, purchased_at: op.ts }]
      : resto;

  return { ...snapshot, owned };
}

export function encolar(outbox, op) {
  return [...outbox, op];
}

// Reproduce la cola en orden. Al primer fallo se detiene: si no hay red, las
// siguientes tampoco van a salir, y así se conserva el orden original.
export async function replay(outbox, acciones) {
  let enviadas = 0;

  for (const op of outbox) {
    try {
      if (op.tipo === 'comprar') await acciones.comprar(op.seriesId, op.volumeNumber);
      else await acciones.descomprar(op.seriesId, op.volumeNumber);
      enviadas += 1;
    } catch {
      return { enviadas, restantes: outbox.slice(enviadas) };
    }
  }

  return { enviadas, restantes: [] };
}
