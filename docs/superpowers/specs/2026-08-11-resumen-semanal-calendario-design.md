# Resumen semanal de novedades del calendario

Fecha: 2026-08-11
Estado: aprobado, pendiente de plan de implementación

## Objetivo

Cada domingo a las 19:00, enviar al canal de Discord un único mensaje resumen
con las series que empiezan (tomos nº1) y los números únicos que salen a la
venta durante la semana siguiente, de lunes a domingo.

A diferencia de los avisos de novedades ya implementados
([2026-08-11-discord-notificaciones-design.md](2026-08-11-discord-notificaciones-design.md)),
esta información **no está en la base de datos local**: solo cubre las series
que el usuario ya sigue. El calendario público de listadomanga.es sí lista todo
lo que va a salir, así que hay que consultarlo en directo.

Se mantiene el requisito de no exponer nada a internet: dos peticiones HTTP
salientes a listadomanga.es y una a Discord.

## Alcance

**Entran** las entradas del calendario que listadomanga marca como:

| Marcador en el HTML | Significado | Tipo |
|---|---|---|
| `<span class="nuevacoleccion">NOVEDAD</span>` | Arranca una colección | `nuevaSerie` |
| `<span class="tomounico">NÚMERO ÚNICO</span>` | Obra en un solo tomo | `unico` |

El marcador es fiable: en el calendario de agosto de 2026, de 105 entradas, 9
contienen `nº1` en el título y son exactamente las 9 marcadas como `NOVEDAD`.
No hay ningún nº1 sin marcar. Por eso el tipo se decide por el marcador y no
parseando el número del título, que tiene formas irregulares
(`nº1 (de 4 y abierta)`, `nº1 (de 7)`, `n&ordm;1`).

**Quedan fuera:**

- Entradas cuya categoría contenga `miniaturas` o `figuras`, sin distinguir
  mayúsculas ni acentos — coleccionables por fascículos como *My Hero Academia:
  La colección de figuras oficial nº1 (de 84)*. Cada colección que arranca
  genera un nº1 que no es manga.
- Entradas cuyo título contenga `Pack` como palabra suelta, o la expresión
  `Sobrecubierta Alternativa`, en ambos casos sin distinguir mayúsculas.
  Duplican algo que ya se lista por su cuenta: *Horobi - Sobrecubierta
  Alternativa* junto a *Horobi*, o *Hisoka Returns! - Pack tomos 1 y 2* junto a
  *Hisoka Returns! nº1*.

**Sí entran** las novelas ligeras (categoría `Novelas Ligeras`) y los ensayos,
guías y artbooks: son decisión explícita del usuario.

Volumen esperado: unas 18 entradas relevantes al mes antes de filtrar, ~4 por
semana.

## Origen de datos y parseo

Fuente: `https://www.listadomanga.es/calendario.php`, que muestra el mes en
curso. Otros meses en `?mes=<1-12>&ano=<YYYY>`.

La página agrupa las salidas por editorial y fecha, y dentro por categoría:

```html
<h2><a href="calendario.php?editorial=3">Norma Editorial</a></h2>
<div style="height: 8px;"> </div>
<h2>Viernes, 7 Agosto 2026</h2>
...
<b><u>Seinen</u></b><br/>
- <a href="coleccion.php?id=6444">Dai Dark (Norma) n&ordm;1 (de 9 y abierta)</a>
  / <a href="autor.php?id=1843">Q-Hayashida</a>
  <span class="nuevacoleccion">NOVEDAD</span><br/>
```

El parseo recorre el documento en orden manteniendo el estado en curso de
**editorial**, **fecha** y **categoría**; cada entrada hereda la tríada vigente.
Los dos `<h2>` van seguidos: el primero con enlace a `?editorial=`, el segundo
con la fecha en texto (`Viernes, 7 Agosto 2026`), que hay que traducir desde los
nombres de mes en español.

Las portadas viven en una rejilla previa a cada bloque:

```html
<a href="coleccion.php?id=6444"><img class="portada" src="https://static.listadomanga.com/....jpg" alt="Dai Dark nº1"/></a>
```

El cruce entrada↔portada se hace **por id de serie**, no por el texto del `alt`:
el id es exacto y el alt no siempre coincide con el título de la entrada.

Cada entrada parseada produce:

```
{ seriesId, titulo, tipo, fecha, editorial, categoria, autores, portadaUrl, url }
```

## Ventana temporal y programación

Envío: **domingos a las 19:00**, hora local. El contenedor ya fija
`TZ=Europe/Madrid` en `docker-compose.yml`, que es de lo que depende el cron
diario existente.

Ventana cubierta: del **lunes siguiente al domingo siguiente**, ambos incluidos.

Como el calendario es mensual, una ventana que cruce el cambio de mes obliga a
pedir dos páginas. El cliente pide siempre el mes del lunes de inicio y, solo si
el domingo final cae en otro mes, pide también ese segundo mes y concatena las
entradas.

El proyecto no usa ninguna librería de cron: `services/cron.js` calcula a mano
los milisegundos hasta las 07:00 con un `setTimeout` que se reprograma tras cada
ejecución. El planificador semanal sigue ese mismo patrón, en la misma línea de
estilo, sin añadir dependencias.

## Arquitectura

Cuatro módulos en `backend/src/services/calendar/`:

```
client.js   Descarga calendario.php del mes o meses necesarios.
            Lo único que toca la red.

parser.js   HTML → lista de entradas estructuradas. Función pura: se prueba
            con un fixture guardado, sin red y sin reloj.

digest.js   Filtra por ventana y por descartes, agrupa por tipo y construye
            el embed. No sabe de red ni consulta la fecha del sistema: la
            ventana se le pasa como argumento.

index.js    Orquesta, guarda la marca en app_config y envía reutilizando
            sendMessage() de services/notifications/discord.js.
```

Interfaz pública:

- `sendWeeklyDigest({ now }): Promise<{ sent: boolean, count: number, skipped?: string }>`
- `scheduleWeeklyDigest(): void` — planificador, llamado desde `startCronJob()`

Se reutiliza tal cual el cliente de Discord existente, que ya trae `?wait=true`,
reintentos con espera creciente y respeto del rate limit. No se duplica nada de
esa lógica.

## Estado y no duplicación

En la tabla `app_config`, que ya existe, se guarda la clave
`last_weekly_digest` con la fecha `YYYY-MM-DD` del lunes que abre la semana
anunciada. Antes de enviar se compara: si coincide, no se reenvía.

Eso permite una recuperación barata ante reinicios. Al arrancar la aplicación,
si estamos entre el domingo a las 19:00 y el lunes a las 23:59 y el resumen de
esa semana no consta como enviado, se envía en ese momento. Pasado el lunes no
se recupera: un resumen de una semana ya empezada a medias no aporta.

## Formato del mensaje

Un único embed, color **`#6366F1`** (índigo, `6514417`), distinto del ámbar de
los anuncios y del verde de los tomos a la venta.

- **Título**: `🗓️ Salidas del 10 al 16 de agosto`
- **Bloque 1**: `📘 Empiezan serie (3)`
- **Bloque 2**: `📗 Números únicos (2)`
- **Línea**: `• [Título](enlace) · Editorial · vie 14`
- **Orden dentro de cada bloque**: por fecha de salida ascendente y, a igualdad
  de fecha, por título alfabéticamente
- **Miniatura**: portada de la primera entrada del bloque `nuevaSerie` según ese
  orden; si esa semana no empieza ninguna serie, la primera de `unico`; si esa
  entrada no tiene portada, el embed va sin miniatura
- **Pie**: `5 novedades · listadomanga.es`
- **Timestamp**: momento del envío

Un bloque vacío no se incluye: si solo hay números únicos, no aparece el bloque
de series.

Límites de Discord a respetar: 1024 caracteres por bloque y 6000 por embed. Los
títulos se recortan a 60 caracteres con `…`, y cada bloque a 15 líneas, cerrando
con una línea `…y N más`.

**Semana sin novedades**: se envía igualmente un embed corto,
`🗓️ Sin nuevas series ni números únicos del 10 al 16 de agosto`, sin bloques.
El silencio no debe ser ambiguo: si un domingo no llega nada, es que algo falla.

## Errores

Hay que distinguir dos ceros que significan cosas opuestas:

- **Cero entradas dentro de la ventana**, con el mes parseado correctamente: es
  una semana floja. Se envía el mensaje corto y se marca como enviada.
- **Cero entradas en todo el mes**: el parseo se ha roto (rediseño de la web,
  redirección, error del servidor). No se envía nada — decir "sin novedades"
  sería mentir — y se registra un error en el log.

Si falla la descarga o el envío, no se escribe `last_weekly_digest`, de modo que
el arranque siguiente lo reintenta mientras siga dentro de la ventana de
recuperación.

Sin `DISCORD_WEBHOOK_URL` definida, el planificador no se registra y la función
sale sin hacer nada, igual que los avisos ya existentes.

## Configuración

Ninguna variable nueva: se reutiliza `DISCORD_WEBHOOK_URL`. El día y la hora
(domingo 19:00) son constantes en el código, como lo son las 07:00 del cron
diario.

## Pruebas

Del parseo, con un recorte real de `calendario.php` guardado como fixture, sin
red:

- Una entrada `NOVEDAD` se clasifica como `nuevaSerie`; una `NÚMERO ÚNICO` como
  `unico`; una entrada sin marcador no aparece en el resultado
- Editorial, fecha y categoría se heredan del bloque en curso
- La fecha en español (`Viernes, 7 Agosto 2026`) se convierte correctamente
- La portada se cruza por id de serie
- Una página sin ninguna entrada devuelve lista vacía sin lanzar

Del filtrado y la ventana:

- Se descarta la categoría *Miniaturas y figuras*
- Se descartan `Pack` y `Sobrecubierta Alternativa`
- **No** se descartan novelas ligeras ni ensayos
- Quedan fuera las entradas del domingo anterior y del lunes posterior
- Semana a caballo de dos meses: se piden y combinan las dos páginas

Del embed:

- Agrupa por tipo y los recuentos cuadran
- Un bloque vacío no se incluye
- Semana sin novedades: texto corto, sin bloques
- 20 títulos: se recorta a 15 líneas y aparece `…y 5 más`
- Un título de 90 caracteres se recorta a 60

Del orquestador:

- Con `last_weekly_digest` ya puesto para esa semana, no se reenvía
- Si el envío falla, no se escribe la marca
- Mes entero vacío: no se envía y se registra el error

## Riesgos

- **El parseo depende del HTML de un tercero.** Un rediseño de listadomanga.es
  lo rompe. Mitigación: el caso "mes entero vacío" se detecta y se registra como
  error en vez de enviar un resumen vacío engañoso, así que el fallo es visible
  en cuanto se mira el log.
- **El marcador `nuevacoleccion` podría marcar cosas que no son un nº1** en
  meses distintos al analizado (por ejemplo, una reedición). Se asume el
  criterio del propio sitio: si listadomanga dice que es una colección nueva,
  para el resumen lo es.

## Fuera de alcance

- Guardar el calendario en la base de datos. Se consulta y se descarta.
- Precio de los tomos: el calendario no lo incluye y sacarlo obligaría a una
  petición por título.
- Filtrar por editorial o por categoría preferida del usuario.
- Cualquier interfaz en la app.
