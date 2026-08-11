# Listado Manga

Tracker personal de colección de manga. Scrapea las fichas de
[listadomanga.es](https://www.listadomanga.es), lleva la cuenta de qué tomos
tienes comprados y avisa de las novedades.

- **Backend**: Express + SQLite (better-sqlite3), con un cron diario a las 07:00
  que refresca las series seguidas. Puerto `4001`.
- **Frontend**: Vue 3 + Tailwind. Puerto `4000`.

```bash
docker compose up -d
```

Los datos persisten en `./data/manga.db`.

## Tests

```bash
cd backend && npm test
```

## Notificaciones a Discord

Cuando el scraper detecta novedades en las series que sigues o en las de tu
wishlist, se envía un aviso al canal de Discord configurado:

- 📢 **Nuevo tomo anunciado** — aparece un tomo que aún no está publicado.
- 🛒 **Ya a la venta** — un tomo publicado que no tienes comprado.

Se dispara tras la actualización diaria de las 07:00, tras "refrescar todo" y
tras refrescar una serie suelta. Cada tomo se avisa una sola vez: la tabla
`notified_volumes` guarda lo ya enviado.

Todo el tráfico es saliente: no hace falta exponer nada a internet.

### Configuración

Copia `.env.example` a `.env` y rellena la URL del webhook (Ajustes del canal →
Integraciones → Webhooks). El fichero `.env` está en `.gitignore`: la URL no
debe acabar en el repositorio, porque cualquiera que la tenga puede publicar en
el canal.

| Variable | Por defecto | Descripción |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | — | Sin ella, las notificaciones quedan desactivadas |
| `DISCORD_SEND_DELAY_MS` | `1500` | Pausa entre mensajes |
| `DISCORD_MAX_EMBEDS_PER_RUN` | `30` | Tope de tarjetas por ejecución |

Para comprobar el formato sin esperar a que haya novedades:

```bash
docker compose exec backend npm run notify:test
```

### Primer arranque

La primera vez que arranca con la tabla creada, todos los tomos existentes se
marcan como ya avisados, así que no recibirás nada de golpe. A partir de ahí
solo llegan las novedades reales.

### Resumen semanal del calendario

Cada domingo a las 19:00 llega un único mensaje con lo que sale de lunes a
domingo de la semana siguiente, leyendo
[el calendario de listadomanga](https://www.listadomanga.es/calendario.php) en
directo:

- 📘 **Empiezan serie** — tomos nº1, los que el calendario marca como NOVEDAD.
- 📗 **Números únicos** — obras que se abren y se cierran en un tomo.

A diferencia de los avisos de novedades, esto no depende de las series que
sigues: cubre todo lo que se publica en España. Se descartan los coleccionables
de figuras, los packs y las sobrecubiertas alternativas.

Si una semana no sale nada, llega igualmente un aviso corto: así el silencio
nunca es ambiguo. Si el contenedor estaba parado el domingo, el resumen sale al
arrancar siempre que siga siendo la misma semana.

Usa el mismo `DISCORD_WEBHOOK_URL`; no hay configuración propia.
