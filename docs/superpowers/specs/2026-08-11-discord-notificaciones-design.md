# Notificaciones de novedades a Discord

Fecha: 2026-08-11
Estado: aprobado, pendiente de plan de implementación

## Objetivo

Avisar en un canal de Discord cuando el scraper detecta novedades en las series
seguidas: tomos recién anunciados y tomos que salen a la venta y aún no están
comprados. La idea es enterarse de las novedades sin tener que entrar a revisar
la app.

Requisito duro: **no exponer nada a internet**. Un webhook de Discord es tráfico
saliente (HTTPS del NAS hacia Discord), así que no hay que abrir ningún puerto
ni publicar ningún servicio. Las portadas viven en `static.listadomanga.com`, un
dominio público, y Discord las carga directamente: el NAS no aparece en ningún
punto del flujo.

## Alcance

Dentro:

- Series con `user_series.status = 'following'` (313 hoy).
- Series en `wishlist` (1 hoy). Estas **no las refresca el cron actualmente**,
  porque el bucle solo recorre `user_series`; hay que ampliarlo.

Fuera:

- Series con `user_series.status = 'discarded'` (12 hoy). El cron las seguirá
  refrescando como hasta ahora — no se toca ese comportamiento — pero no
  generan avisos.
- Cambios de precio o de fecha de un tomo ya conocido.
- Cualquier interfaz de configuración en la app.

## Eventos

Se evalúa tomo a tomo. Un mismo tomo puede generar los dos eventos a lo largo
del tiempo: hoy se anuncia y dentro de tres meses sale a la venta.

| Evento | Condición |
|---|---|
| `announced` (📢) | Aparece en `volumes` un `(series_id, number)` que no estaba, con `is_released = 0` |
| `on_sale` (🛒) | Tomo con `is_released = 1` que no figura en `user_volumes` |

Casos derivados:

- Tomo que aparece directamente publicado: solo `on_sale`.
- Tomo que ya tenías marcado como comprado cuando sale: ningún aviso.
- Tomo anunciado que luego se publica: primero 📢, después 🛒.

## Modelo de datos

`replaceVolumes()` hace `DELETE` + `INSERT` de todos los tomos de la serie en
cada sincronización, así que no queda rastro de qué era nuevo. Y como el aviso
se dispara en cualquier actualización (ver más abajo), la deduplicación tiene
que ser persistente: refrescar la misma serie tres veces seguidas debe producir
un único mensaje.

Tabla nueva, creada en `initDatabase()` siguiendo el patrón que ya usa el
proyecto:

```sql
CREATE TABLE IF NOT EXISTS notified_volumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL,
  volume_number INTEGER NOT NULL,
  event_type TEXT NOT NULL,          -- 'announced' | 'on_sale'
  notified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(series_id, volume_number, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notified_series ON notified_volumes(series_id);
```

La clave única incluye `event_type` para que un tomo pueda registrar sus dos
eventos por separado.

### Línea base

Hay dos momentos en los que se rellena la tabla **sin enviar nada**, para no
inundar el canal:

1. **Arranque inicial.** La primera vez que se ejecuta la migración se marcan
   como ya avisados todos los tomos existentes de series en alcance: un registro
   `announced` por cada tomo, más un `on_sale` por cada tomo con
   `is_released = 1`. Resultado: cero mensajes en la primera ejecución. Los 210
   tomos anunciados sin publicar irán generando su 🛒 conforme salgan, que es el
   comportamiento deseado.

2. **Al entrar una serie en alcance.** En `followSeries`, `refollowSeries` y
   `addToWishlist` se aplica la misma línea base a los tomos que esa serie ya
   tenga en la BD. Añadir una serie de 40 tomos no dispara 40 tarjetas.

## Arquitectura

Tres módulos en `backend/src/services/notifications/`, cada uno con una
responsabilidad y sin conocimiento del otro dominio:

```
detector.js   Consulta la BD y devuelve los eventos pendientes: tomos en
              alcance que cumplen criterio y no están en notified_volumes.
              No sabe nada de Discord.

discord.js    Cliente del webhook: construye los embeds, los agrupa en
              mensajes, controla el ritmo de envío y los reintentos.
              No sabe nada de manga.

index.js      Orquesta: pide eventos al detector, los manda por discord.js y
              marca en notified_volumes únicamente lo confirmado.
```

Interfaz pública del módulo:

- `notifyNewReleases()` — punto de entrada único, sin argumentos. Detecta,
  envía y marca. Idempotente: si no hay nada pendiente, no hace nada.
  Siempre evalúa el estado global de la BD, no la serie que acabe de
  sincronizarse: así, si un envío falló ayer, se recupera en la siguiente
  llamada venga de donde venga.
- `markSeriesAsBaseline(seriesId)` — registra los tomos actuales de una serie
  como ya avisados, sin enviar.

Si `DISCORD_WEBHOOK_URL` no está definida, `notifyNewReleases()` sale
inmediatamente y la app se comporta igual que hoy.

### Puntos de integración

`notifyNewReleases()` se llama después de que la sincronización haya terminado
de persistir, en:

- `services/cron.js` → al final de `updateAllUserSeries()`
- `controllers/series.controller.js` → `refreshSeries` (POST `/:id/refresh`)
- `controllers/series.controller.js` → `refreshAllSeries` (POST `/refresh-all`)

`markSeriesAsBaseline()` se llama en:

- `controllers/user.controller.js` → `followSeries`, `refollowSeries`,
  `addToWishlist`

Además, el bucle de `updateAllUserSeries()` pasa a recorrer la unión de
`user_series` y `wishlist`, para que las series de la wishlist también se
refresquen a diario.

El envío no debe bloquear la respuesta HTTP de los endpoints de refresco: se
lanza en segundo plano y los errores se registran en el log.

## Formato de las tarjetas

Un embed por tomo. Los dos tipos se distinguen por color, cabecera, tamaño de
portada y campos:

| | 📢 `announced` | 🛒 `on_sale` |
|---|---|---|
| Color de barra | Ámbar `#F59E0B` (`16096779`) | Verde `#22C55E` (`2278750`) |
| Cabecera (author) | `📢 Nuevo tomo anunciado` | `🛒 Ya a la venta` |
| Título | `{serie} #{número}`, enlazado a la ficha de listadomanga | igual |
| Portada | Miniatura (`thumbnail`) | Imagen grande (`image`) |
| Campos | Editorial · Precio · Salida prevista | Editorial · Precio · Páginas |
| Contexto | `Tienes N de M tomos` | `Te faltan N tomos de esta serie` |
| Pie | Autor de la serie | Autor + `⭐ En tu wishlist` si aplica |
| Timestamp | Momento del envío | Momento del envío |

Definición de los campos de contexto:

- `Tienes N de M tomos`: `N` = tomos de esa serie en `user_volumes`; `M` =
  `series.total_volumes`, o `released_volumes` si el total es 0 o nulo. Si
  ninguno de los dos tiene valor, el campo se omite.
- `Te faltan N tomos`: `N` = tomos de esa serie con `is_released = 1` que no
  están en `user_volumes`, contando el que motiva el aviso. Es la misma
  definición que usa `getPending`.

Detalles de formato:

- Precio en formato español con símbolo de euro: `9,50 €`. Si el precio es `0` o
  nulo, el campo se omite.
- `release_date` llega como texto tipo `"Septiembre 2026"`; se muestra tal cual.
- Si `cover_url` es nulo, el embed va sin imagen. Hoy no hay ninguno nulo en las
  1.775 filas en alcance, pero el código lo contempla.
- El enlace del título apunta a `https://www.listadomanga.es/coleccion.php?id=N`,
  que es lo que ya guarda `series.url`. Nada apunta al NAS.

## Envío

- **Secuencial, nunca en paralelo.** Un mensaje detrás de otro.
- **Pausa configurable entre mensajes**, `DISCORD_SEND_DELAY_MS`, por defecto
  1500 ms — en la línea de los 2000 ms que ya usa el scraper entre peticiones.
- **Confirmación de cada envío.** Se llama al webhook con `?wait=true`, de modo
  que Discord responde con el mensaje creado y su ID en lugar del `204` a
  ciegas. Hasta que no llega esa confirmación no se envía el siguiente mensaje
  ni se marca nada como notificado.
- **Agrupación**: hasta 10 embeds por mensaje, que es el máximo de Discord.
- **Tope por ejecución**: `DISCORD_MAX_EMBEDS_PER_RUN`, por defecto 30. Si se
  supera, se envían los primeros y el último mensaje cierra con
  `…y otros N tomos más`. Los tomos no enviados **no** se marcan, así que salen
  en la siguiente ejecución.
- **Rate limit**: ante un `429` se espera lo que indique `retry_after` en la
  respuesta y se reintenta.
- **Reintentos**: 3 intentos por mensaje con espera creciente. Si se agotan, ese
  mensaje se descarta, sus tomos quedan sin marcar y se reintentarán en la
  siguiente actualización. Nunca se pierde una novedad por un fallo de red.
- **Marcado transaccional**: los tomos de un mensaje se marcan en
  `notified_volumes` en una sola transacción, después de confirmarse el envío.

## Configuración

Variables de entorno, todas opcionales salvo la primera:

| Variable | Por defecto | Descripción |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | — | URL del webhook. Sin ella, las notificaciones quedan desactivadas |
| `DISCORD_SEND_DELAY_MS` | `1500` | Pausa entre mensajes |
| `DISCORD_MAX_EMBEDS_PER_RUN` | `30` | Tope de tarjetas por ejecución |

La URL se guarda en un fichero `.env` en la raíz, que `docker compose` lee
automáticamente. En `docker-compose.yml` se referencia como
`${DISCORD_WEBHOOK_URL:-}`, nunca con el valor literal: ese fichero está en git
y el repositorio está publicado en GitHub, así que el secreto no puede vivir
ahí. Hay que **añadir `.env` al `.gitignore`**, que hoy no lo cubre.

Se documentará en un `.env.example` con el valor vacío.

## Pruebas

Unitarias, con SQLite en memoria:

- Tomo nuevo sin publicar → un evento `announced`.
- Tomo que pasa de `is_released` 0 a 1 → un evento `on_sale`.
- Tomo publicado ya presente en `user_volumes` → ningún evento.
- Dos llamadas seguidas a `notifyNewReleases()` → cero eventos en la segunda.
- Serie recién seguida → línea base aplicada, cero eventos.
- Serie `discarded` con tomo nuevo → ningún evento.
- Serie de la wishlist con tomo nuevo → evento generado.

Del constructor de embeds:

- Cada tipo lleva su color, cabecera y campos.
- Portada nula, precio a 0 y fecha nula no rompen la construcción.

Del envío, con `fetch` mockeado:

- Se respeta la pausa entre mensajes.
- Un `429` provoca espera y reintento.
- Un fallo definitivo deja los tomos sin marcar.
- Los embeds se agrupan de 10 en 10.

Manual:

- Script `npm run notify:test` que envía una tarjeta de ejemplo de cada tipo al
  canal, para validar el formato real antes de dejarlo automático.

## Riesgos

- **La línea base inicial es irreversible en la práctica.** Si se ejecuta la
  migración con el alcance mal calculado, se marcan como avisados tomos que
  deberían haber notificado. Mitigación: el primer arranque se hace sin
  `DISCORD_WEBHOOK_URL` definida, de modo que la migración crea la línea base y
  deja en el log cuántas filas insertó de cada tipo; se revisa ese recuento y
  solo entonces se añade la URL al `.env` y se reinicia. Antes de la migración
  se copia `data/manga.db`, igual que ya se hizo con
  `manga.db.bak-pre-refactor`.
- **Fuga del webhook.** Cualquiera con la URL puede publicar en el canal. Vive
  solo en `.env`, fuera de git. Si se filtra, se regenera desde Discord.
