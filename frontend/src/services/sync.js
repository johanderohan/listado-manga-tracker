// Timeout corto a propósito: con la VPN apagada la petición al NAS puede
// quedarse colgada, y la app no debe esperarla nunca.
const TIMEOUT_MS = 2000;

export async function fetchSnapshot({ timeoutMs = TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const ctrl = new AbortController();
  const temporizador = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetchImpl('/api/user/snapshot', { signal: ctrl.signal });
    if (!res.ok) throw new Error(`snapshot ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(temporizador);
  }
}

// Precarga las portadas de los pendientes para que el service worker las
// guarde. Se cargan como <img> y no con fetch a propósito: la CSP que sirve
// nginx tiene connect-src 'self', así que un fetch a static.listadomanga.com
// se bloquea, mientras que como imagen entra por img-src, que sí lo permite.
// La petición pasa igualmente por el service worker, que es lo que importa.
export function precargarPortadas(urls) {
  for (const url of urls.filter(Boolean)) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }
}
