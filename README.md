# Listado Manga Tracker

Aplicación web personal para gestionar tu colección de manga. Permite seguir series, registrar tomos comprados, llevar una wishlist y ver estadísticas de tu colección, con datos obtenidos automáticamente de [listadomanga.es](https://www.listadomanga.es).

## Funcionalidades

- **Catálogo**: sincroniza y navega todas las series de listadomanga.es
- **Mi colección**: sigue series y marca los tomos que ya tienes
- **Pendientes**: lista de tomos publicados que aún no has comprado
- **Wishlist**: guarda series que quieres seguir en el futuro
- **Actualización automática**: el servidor refresca los datos de tus series cada 24 horas

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + React Router + Vite |
| Backend | Node.js + Express |
| Base de datos | SQLite (better-sqlite3) |
| Scraping | Cheerio |
| Despliegue | Docker + docker-compose |

## Requisitos

- [Docker](https://docs.docker.com/get-docker/) y [docker-compose](https://docs.docker.com/compose/)

## Instalación y uso

```bash
# 1. Clonar el repositorio
git clone https://github.com/johanderohan/listado-manga-tracker.git
cd listado-manga-tracker

# 2. Levantar la aplicación
docker compose up --build
```

Una vez arriba:

- **Frontend**: http://localhost:4000
- **Backend API**: http://localhost:4001

## Primeros pasos

1. Abre http://localhost:4000
2. Ve a la sección **Catálogo** y pulsa **Sincronizar** para importar todas las series de listadomanga.es
3. Busca una serie y pulsa **Seguir** para añadirla a tu colección
4. Desde **Mi colección** puedes marcar los tomos que ya tienes

## Estructura del proyecto

```
.
├── backend/
│   └── src/
│       ├── index.js          # Servidor Express
│       ├── models/
│       │   └── database.js   # Esquema SQLite
│       ├── routes/
│       │   ├── series.js     # Endpoints de series
│       │   └── user.js       # Endpoints de colección y wishlist
│       └── services/
│           ├── scraper.js    # Scraping de listadomanga.es
│           └── cron.js       # Actualización automática diaria
├── frontend/
│   └── src/
│       ├── pages/            # Vistas (Catálogo, Mi colección, Wishlist...)
│       ├── components/       # Componentes reutilizables
│       └── services/
│           └── api.js        # Cliente de la API
├── data/                     # Base de datos SQLite (generada automáticamente)
└── docker-compose.yml
```

## Variables de entorno

| Variable | Valor por defecto | Descripción |
|----------|------------------|-------------|
| `PORT` | `3001` | Puerto del servidor backend |
| `DB_PATH` | `/app/data/manga.db` | Ruta del archivo de base de datos |
| `NODE_ENV` | `development` | Entorno de ejecución |

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/series` | Lista series (con `?search=`, `?limit=`, `?offset=`) |
| `GET` | `/api/series/search?q=` | Busca series en listadomanga.es |
| `GET` | `/api/series/:id` | Detalle de una serie |
| `POST` | `/api/series/sync` | Sincroniza el catálogo completo |
| `POST` | `/api/series/:id/refresh` | Refresca una serie concreta |
| `GET` | `/api/user/series` | Series seguidas por el usuario |
| `GET` | `/api/user/pending` | Tomos publicados sin comprar |
| `GET` | `/api/user/wishlist` | Wishlist |
| `GET` | `/api/user/stats` | Estadísticas de la colección |
