const BASE_URL = 'https://www.listadomanga.es';

// calendario.php muestra el mes en curso; con mes y ano se pide cualquier otro.
export async function fetchMonth({ mes, ano }, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${BASE_URL}/calendario.php?mes=${mes}&ano=${ano}`);
  if (!res.ok) throw new Error(`calendario.php respondió ${res.status}`);
  return res.text();
}
