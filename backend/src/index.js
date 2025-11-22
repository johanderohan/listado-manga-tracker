import express from 'express';
import cors from 'cors';
import { initDatabase } from './models/database.js';
import seriesRoutes from './routes/series.js';
import userRoutes from './routes/user.js';
import { startCronJob } from './services/cron.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Inicializar base de datos
initDatabase();

// Rutas
app.use('/api/series', seriesRoutes);
app.use('/api/user', userRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);

  // Iniciar cron job para actualización diaria
  startCronJob();
});
