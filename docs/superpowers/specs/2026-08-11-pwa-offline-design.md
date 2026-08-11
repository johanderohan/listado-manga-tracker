# PWA offline-first

Fecha: 2026-08-11
Estado: aprobado, pendiente de plan de implementación

## Objetivo

Poder consultar la colección desde el móvil en una tienda, sin VPN y con mala
cobertura o ninguna: qué tomos faltan, qué series se siguen, buscar entre ellas
y marcar un tomo recién comprado. Los datos viven en el móvil y se sincronizan
cuando el NAS vuelve a estar accesible.

## El problema actual

Ya existe un PWA a medias: `frontend/public/manifest.json` y un `sw.js`
registrado desde `main.js`. No funciona en la práctica por tres motivos que el
diseño corrige:

1. **El service worker es network-first sin timeout.** Con la VPN apagada, cada
   petición a `/api/` espera a que la red falle antes de mirar el caché. El
   resultado es un spinner largo, no una app offline.
2. **Los datos solo existen como respuestas HTTP cacheadas.** Cada pantalla
   depende de haber visitado antes ese endpoint exacto, y el buscador solo puede
   encontrar lo que se cacheó.
3. **No hay forma de escribir sin conexión.** Marcar un tomo comprado en la
   tienda es imposible.

Además, el icono declarado en el manifest es un JPEG de 736×736 y 214 KB
anunciado a la vez como 192×192 y 512×512 y marcado `maskable` sin zona de
seguridad, lo que hace poco fiable que Android lo ofrezca como instalable.

## Alcance

**Funciona sin conexión:**

- Home: tomos pendientes, próximos lanzamientos y recientes
- Mis series, con su buscador y sus pestañas (en curso, todas, descartadas)
- Detalle de serie: lista de tomos con cuáles se tienen y cuáles faltan
- Wishlist, en modo solo lectura
- Marcar y desmarcar un tomo como comprado

**Requiere conexión y VPN**, y lo indica claramente en lugar de fallar:

- Buscar series nuevas (`/buscar`): consulta listadomanga a través del backend
- Estadísticas
- Añadir o quitar de la wishlist
- Seguir, descartar o refrescar una serie

## Datos

Endpoint nuevo, `GET /api/user/snapshot`, que devuelve toda la colección en una
sola petición:

```json
{
  "generatedAt": "2026-08-11T18:00:00.000Z",
  "lastRefresh": "2026-08-11 07:04:12",
  "series":  [{ "id", "name", "original_name", "author", "artist",
                "editorial_es", "total_volumes", "released_volumes",
                "is_complete", "reading_direction", "synopsis", "url",
                "status" }],
  "volumes": [{ "series_id", "number", "price", "release_date",
                "is_released", "cover_url" }],
  "owned":   [{ "series_id", "volume_number", "purchased_at" }],
  "wishlist":[{ "series_id", "notes" }]
}
```

La lista de campos de `series` no es arbitraria: son exactamente los que pinta
la ficha de serie (`original_name`, `artist`, `reading_direction`, `synopsis`,
`url`), que está dentro del alcance offline. `lastRefresh` alimenta la etiqueta
de "última actualización" de la home.

Incluye las series con `status` `following` **y** `discarded`, para que la
pestaña de descartadas siga funcionando, y los tomos de ambas.

`purchased_at` es imprescindible: la home ordena los tomos recientes por fecha
de compra, y sin ese campo esa sección no se puede calcular en local.

Medido sobre la base real con todos esos campos: 328 series (seguidas y
descartadas), 2.131 tomos y 1.586 comprados dan **720 KB** de JSON, de los que
141 KB son sinopsis. Es el 14% del límite de `localStorage`, que ronda los 5 MB.

### Derivaciones que hoy calcula el backend

Se replican con la misma fórmula para que la interfaz no cambie de
comportamiento:

- **Progreso de una serie**: `tomos comprados × 100 / total_volumes`, redondeado
  a un decimal, y `0` si `total_volumes` es 0 o nulo. Cuenta todos los tomos
  comprados de la serie, estén publicados o no.
- **Portada de una serie**: la `cover_url` de su tomo número 1.
- **Tomos recientes**: los comprados, ordenados por `purchased_at` descendente,
  como mucho 50.
- **Tomos pendientes**: los de series seguidas, con `is_released = 1`, que no
  estén entre los comprados.
- **Próximos lanzamientos**: los de series seguidas con `is_released = 0`.
- **Contadores de la home**: `totalSeries` cuenta todas las series del usuario
  incluidas las descartadas; `totalVolumes` son los tomos comprados;
  `completedSeries` son las series con `is_complete = 1` cuyos tomos comprados
  igualan a `total_volumes`; `wishlistCount` es el tamaño de la wishlist.

Las tarjetas esperan nombres de campo concretos, que las derivaciones deben
respetar: los tomos llevan `series_id`, `number`, `series_name`, `cover_url`,
`series_cover`, `price`, `release_date` y `purchased_at`; las series llevan `id`,
`name`, `cover_url`, `is_complete`, `owned_volumes`, `total_volumes` y
`progress`.

### Almacenamiento

Dos claves en `localStorage`:

| Clave | Contenido |
|---|---|
| `lm.snapshot` | El snapshot completo tal cual llega, más la marca de tiempo de la última sincronización con éxito |
| `lm.outbox` | Cola de escrituras pendientes de enviar |

Se descarta `IndexedDB`: con 400 KB no compensa ni la dependencia (`idb`,
`dexie`) ni el salto a una API asíncrona.

## Arquitectura del frontend

La lógica que merece pruebas se extrae a módulos puros, sin Vue ni navegador:

```
src/lib/collection.js   Derivaciones del snapshot: pendientes, próximos,
                        mis series con progreso, detalle de una serie,
                        búsqueda por nombre. Funciones puras.

src/lib/outbox.js       Cola de escrituras: encolar, aplicar al snapshot,
                        reproducir contra el API, vaciar.

src/lib/storage.js      Leer y escribir las dos claves de localStorage,
                        tolerando datos corruptos.

src/services/sync.js    Orquesta: hidratar al arrancar, sincronizar con
                        timeout, precargar portadas de pendientes.

src/stores/collection.js  Store de Pinia: mantiene el snapshot en memoria y
                        expone las derivaciones a las vistas.
```

Las vistas `HomeView`, `MySeriesView`, `SeriesDetailView` y `WishlistView` dejan
de llamar al API y leen del store. `MySeriesView` ya filtra en cliente sobre las
series que recibe, así que su buscador empieza a funcionar sin conexión sin
tocar ese código.

La hidratación ocurre **antes de montar la app**, en `main.js`: leer y parsear
400 KB de `localStorage` son unos milisegundos, así que la primera pintura ya
sale con datos. En ningún momento se espera a la red para mostrar algo.

## Sincronización

Al arrancar, en paralelo a la pintura:

1. Se vacía la cola de escrituras pendientes, en orden.
2. Se pide `/api/user/snapshot` con un **timeout de 2 segundos** vía
   `AbortController`.
3. Si responde, se reemplaza el snapshot, se guarda y las vistas se actualizan
   solas. Si no, no pasa nada: se sigue con los datos locales y no se muestra
   ningún error.

El chip de estado de la barra permite forzarla en cualquier momento.

## Cola de escrituras

Solo cubre marcar y desmarcar un tomo como comprado. Cada operación:

1. Se aplica **inmediatamente** al snapshot local, así que el tomo aparece
   marcado al instante.
2. Se encola como `{ id, tipo: 'comprar' | 'descomprar', seriesId, volumeNumber, ts }`.

En la siguiente sincronización con éxito, la cola se reproduce en orden contra
los endpoints que ya existen (`POST /api/user/volumes` y
`DELETE /api/user/volumes/:seriesId/:volumeNumber`); no hace falta ningún
endpoint de escritura nuevo. Cada operación enviada con éxito se retira de la
cola; si una falla, se detiene el vaciado y lo que queda se reintenta en la
siguiente.

Al ser un único usuario no hay conflictos que resolver: el snapshot que llega
después de vaciar la cola ya refleja los cambios, y gana lo último hecho.

## Service worker

Se reescribe `frontend/public/sw.js` con una estrategia por tipo de recurso:

| Recurso | Estrategia |
|---|---|
| `/assets/*` (hash en el nombre, inmutables) | Cache-first. Una vez cargados no se toca la red |
| `index.html` y navegaciones | Red con timeout corto y vuelta al caché; toda navegación cae al `index.html` cacheado |
| `/api/*` | **No se intercepta.** Los datos viven en `localStorage`; que falle rápido es lo deseable |
| `static.listadomanga.com` | Cache-first permanente |

Dejar de interceptar `/api/` es lo que elimina el spinner infinito: la petición
falla en cuanto el sistema decide que no hay ruta, y la app ya está pintada.

## Portadas

Las portadas son URLs absolutas y públicas de `static.listadomanga.com`, así que
en la tienda con datos móviles se cargan aunque el NAS sea inalcanzable. Pesan
unos 7,3 KB cada una.

La política elegida es guardar solo lo necesario:

- **Lo que se visita se queda**, por el cache-first del service worker. Los
  nombres de fichero son hashes, así que nunca caducan.
- Tras cada sincronización con éxito, se precargan en segundo plano las portadas
  de los **tomos pendientes** (~55 hoy, unos 400 KB), que son las que se van a
  mirar en la tienda.

Descargar las 1.780 (unos 12 MB) queda descartado por decisión explícita.

## Interfaz

- **Chip de estado en la barra superior**: `Sincronizado hace 2 h`, o
  `Sin conexión · datos de hace 3 días` cuando el último intento falló. Tocarlo
  fuerza la sincronización.
- **Cambios pendientes**: si la cola no está vacía, el chip muestra
  `2 cambios sin enviar` y desaparece al sincronizar.
- **Pantallas que requieren conexión**: mensaje claro indicando que hacen falta
  conexión y VPN, en lugar de un error de red.

### Icono e instalación

Se generan dos PNG desde el `favicon.jpg` actual, de 192×192 y 512×512, y se
declaran en el manifest con su tamaño real y `purpose: "any"`. El JPEG actual se
mantiene como favicon.

## Pruebas

El frontend no tiene infraestructura de tests. No se añade Vitest ni jsdom: los
módulos de `src/lib/` son puros y se prueban con el mismo `node --test` que ya
usa el backend, añadiendo el script al `package.json` del frontend.

De `lib/collection.js`:

- Los pendientes salen de cruzar series, tomos publicados y comprados
- El progreso usa la misma fórmula que el backend, con un decimal, y es 0 si la
  serie no tiene total conocido
- Los recientes se ordenan por fecha de compra descendente y se limitan a 50
- La búsqueda ignora mayúsculas y acentos: "shonan" encuentra "Shōnan"
- Una serie sin tomos no rompe las derivaciones
- Las series descartadas no aparecen entre las que se siguen

De `lib/outbox.js`:

- Encolar aplica el cambio al snapshot inmediatamente
- Marcar y desmarcar el mismo tomo deja la cola coherente
- Se reproduce en orden de encolado
- Si una operación falla, las siguientes se conservan en la cola

De `lib/storage.js`:

- Guardar y recuperar el snapshot conserva los datos
- Un `localStorage` con JSON corrupto o a medias se descarta sin lanzar

Del backend:

- `/api/user/snapshot` devuelve las cuatro colecciones
- Incluye las series descartadas y sus tomos
- No incluye series que no se siguen

**Prueba manual en el móvil**, que es donde vive el problema: instalar la PWA en
casa, sincronizar, poner el móvil en modo avión, abrir la app y comprobar home,
mis series, buscador y detalle de serie; marcar un tomo como comprado; volver a
conectar y verificar que el cambio llegó al NAS.

## Riesgos

- **El snapshot crece con la colección.** Hoy son 400 KB sobre un límite de ~5
  MB. Haría falta multiplicar por diez la colección para acercarse al problema;
  si algún día ocurre, el cambio a IndexedDB afecta solo a `lib/storage.js`.
- **`localStorage` puede desaparecer.** El sistema operativo puede limpiar el
  almacenamiento de un sitio que no se visita. Si el snapshot no está, la app
  arranca vacía y pide sincronizar; no se pierde nada porque el NAS es la fuente
  de verdad, pero conviene abrirla en casa de vez en cuando.
- **La cola se pierde si se borra el almacenamiento** antes de sincronizar. Con
  una o dos operaciones entre visitas a casa, el riesgo es bajo.

## Fuera de alcance

- Exponer la app a internet o quitar la VPN.
- Sincronización en segundo plano con el móvil cerrado (Background Sync).
- Resolución de conflictos: un solo usuario.
- Añadir series nuevas sin conexión.
