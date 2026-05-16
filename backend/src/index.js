import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initDatabase } from './config/db.js';
import seriesRoutes from './routes/series.routes.js';
import userRoutes from './routes/user.routes.js';
import { startCronJob } from './services/cron.js';
import { notFound, errorHandler } from './middleware/error.js';

const app = express();
const PORT = process.env.PORT || 3001;

// helmet añade cabeceras estándar de seguridad y oculta X-Powered-By.
// CSP desactivada: en producción la fija nginx (que sirve el frontend).
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Inicializar base de datos
initDatabase();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Rutas
app.use('/api/series', seriesRoutes);
app.use('/api/user', userRoutes);

// Manejo de errores (404 + handler global)
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);

  // Iniciar cron job para actualización diaria
  startCronJob();
});
