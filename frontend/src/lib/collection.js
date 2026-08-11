// Los meses vienen en español dentro de release_date ('Septiembre 2025'). El
// backend ordena convirtiéndolos a 'AAAA-MM'; aquí se replica al pie de la
// letra para que el orden de las listas no cambie al pasar a offline.
const MESES = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
};

const CLAVE_PENDIENTE = { mes: '00', ano: '0000' };
const CLAVE_PROXIMO = { mes: '12', ano: '9999' };

function claveFecha(dateStr, { mes, ano }) {
  if (!dateStr) return `${ano}-${mes}`;
  const partes = String(dateStr).toLowerCase().split(' ');
  if (partes.length !== 2) return `${ano}-${mes}`;
  return `${partes[1] || ano}-${MESES[partes[0]] || mes}`;
}

const sinAcentos = (texto) =>
  String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function indexSnapshot(snapshot) {
  const seriesById = new Map(snapshot.series.map((s) => [s.id, s]));

  const volumesBySeries = new Map();
  for (const v of snapshot.volumes) {
    if (!volumesBySeries.has(v.series_id)) volumesBySeries.set(v.series_id, []);
    volumesBySeries.get(v.series_id).push(v);
  }

  const ownedKeys = new Set();
  const ownedCount = new Map();
  for (const o of snapshot.owned) {
    ownedKeys.add(`${o.series_id}:${o.volume_number}`);
    ownedCount.set(o.series_id, (ownedCount.get(o.series_id) || 0) + 1);
  }

  // La portada de una serie es la de su tomo 1, igual que en el backend.
  const coverBySeries = new Map();
  for (const [id, vols] of volumesBySeries) {
    coverBySeries.set(id, vols.find((v) => v.number === 1)?.cover_url ?? null);
  }

  return { seriesById, volumesBySeries, ownedKeys, ownedCount, coverBySeries };
}

function conContexto(v, serie, idx) {
  return {
    ...v,
    series_id: serie.id,
    series_name: serie.name,
    editorial_es: serie.editorial_es,
    series_cover: idx.coverBySeries.get(serie.id) ?? null
  };
}

export function pendingVolumes(snapshot, idx = indexSnapshot(snapshot)) {
  const out = [];
  for (const serie of snapshot.series) {
    if (serie.status !== 'following') continue;
    for (const v of idx.volumesBySeries.get(serie.id) ?? []) {
      if (v.is_released !== 1) continue;
      if (idx.ownedKeys.has(`${serie.id}:${v.number}`)) continue;
      out.push(conContexto(v, serie, idx));
    }
  }

  out.sort((a, b) => {
    const c = claveFecha(b.release_date, CLAVE_PENDIENTE).localeCompare(claveFecha(a.release_date, CLAVE_PENDIENTE));
    if (c !== 0) return c;
    return a.series_name.localeCompare(b.series_name, 'es') || a.number - b.number;
  });

  return out;
}

export function upcomingVolumes(snapshot, idx = indexSnapshot(snapshot)) {
  const out = [];
  for (const serie of snapshot.series) {
    if (serie.status !== 'following') continue;
    for (const v of idx.volumesBySeries.get(serie.id) ?? []) {
      if (v.is_released !== 0 || !v.release_date) continue;
      out.push(conContexto(v, serie, idx));
    }
  }

  out.sort((a, b) =>
    claveFecha(a.release_date, CLAVE_PROXIMO).localeCompare(claveFecha(b.release_date, CLAVE_PROXIMO))
  );

  return out;
}

export function recentVolumes(snapshot, limit = 50, idx = indexSnapshot(snapshot)) {
  return [...snapshot.owned]
    .sort((a, b) => String(b.purchased_at ?? '').localeCompare(String(a.purchased_at ?? '')))
    .slice(0, limit)
    .map((o) => {
      const serie = idx.seriesById.get(o.series_id);
      if (!serie) return null;
      const v = (idx.volumesBySeries.get(o.series_id) ?? []).find((x) => x.number === o.volume_number);
      return {
        ...conContexto(v ?? { number: o.volume_number }, serie, idx),
        number: o.volume_number,
        purchased_at: o.purchased_at ?? null
      };
    })
    .filter(Boolean);
}

export function mySeries(snapshot, idx = indexSnapshot(snapshot)) {
  return snapshot.series
    .map((s) => {
      const owned_volumes = idx.ownedCount.get(s.id) ?? 0;
      const total = s.total_volumes ?? 0;
      return {
        ...s,
        owned_volumes,
        cover_url: idx.coverBySeries.get(s.id) ?? null,
        // Misma fórmula que el SQL: un decimal, y 0 si no hay total conocido.
        progress: total > 0 ? Math.round(((owned_volumes * 100) / total) * 10) / 10 : 0
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function seriesDetail(snapshot, seriesId, idx = indexSnapshot(snapshot)) {
  const serie = idx.seriesById.get(Number(seriesId));
  if (!serie) return null;

  const volumes = (idx.volumesBySeries.get(serie.id) ?? [])
    .map((v) => ({ ...v, owned: idx.ownedKeys.has(`${serie.id}:${v.number}`) ? 1 : 0 }))
    .sort((a, b) => a.number - b.number);

  return { ...serie, cover_url: idx.coverBySeries.get(serie.id) ?? null, volumes };
}

export function wishlistSeries(snapshot, idx = indexSnapshot(snapshot)) {
  return snapshot.wishlist
    .map((w) => {
      const serie = idx.seriesById.get(w.series_id);
      if (!serie) return null;
      return { ...serie, notes: w.notes ?? null, cover_url: idx.coverBySeries.get(serie.id) ?? null };
    })
    .filter(Boolean);
}

export function homeStats(snapshot, idx = indexSnapshot(snapshot)) {
  const delUsuario = snapshot.series.filter((s) => s.status !== null && s.status !== undefined);

  return {
    totalSeries: delUsuario.length,
    totalVolumes: snapshot.owned.length,
    wishlistCount: snapshot.wishlist.length,
    completedSeries: delUsuario.filter(
      (s) => s.is_complete === 1 && s.total_volumes != null && (idx.ownedCount.get(s.id) ?? 0) === s.total_volumes
    ).length,
    lastRefresh: snapshot.lastRefresh ?? null
  };
}

export function searchSeries(series, query) {
  const q = sinAcentos(query).trim();
  if (!q) return series;
  return series.filter((s) => sinAcentos(s.name).includes(q) || sinAcentos(s.original_name).includes(q));
}
