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

// Pide al navegador que se traiga las portadas de los pendientes para que el
// service worker las guarde. Silencioso: si falla, no pasa nada.
export async function precargarPortadas(urls) {
  await Promise.allSettled(
    urls.filter(Boolean).map((url) => fetch(url, { mode: 'no-cors', cache: 'force-cache' }))
  );
}
