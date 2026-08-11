// Manda una tarjeta de ejemplo de cada tipo al canal configurado, para revisar
// el formato real sin esperar a que haya novedades. No toca la base de datos.
import { buildEmbed } from '../services/notifications/embeds.js';
import { sendMessage } from '../services/notifications/discord.js';

const SAMPLES = [
  {
    event_type: 'announced',
    series_id: 1,
    volume_number: 9,
    price: 9.5,
    pages: 208,
    release_date: 'Noviembre 2026',
    cover_url: 'https://static.listadomanga.com/0c10ab3add52c1c2e04d156a70bd',
    series_name: '[PRUEBA] Serie de ejemplo',
    author: 'Autor de Ejemplo',
    editorial_es: 'Norma Editorial',
    series_url: 'https://www.listadomanga.es/',
    total_volumes: 9,
    released_volumes: 8,
    owned_count: 8,
    missing_count: 1,
    in_wishlist: 0
  },
  {
    event_type: 'on_sale',
    series_id: 2,
    volume_number: 21,
    price: 8.95,
    pages: 192,
    release_date: 'Agosto 2026',
    cover_url: 'https://static.listadomanga.com/b7f3e871c47125430202f8d49460',
    series_name: '[PRUEBA] Otra serie',
    author: 'Otra Autoría',
    editorial_es: 'Planeta Cómic',
    series_url: 'https://www.listadomanga.es/',
    total_volumes: 25,
    released_volumes: 21,
    owned_count: 18,
    missing_count: 3,
    in_wishlist: 1
  }
];

if (!process.env.DISCORD_WEBHOOK_URL) {
  console.error('Falta DISCORD_WEBHOOK_URL. Defínela en .env y vuelve a ejecutar.');
  process.exit(1);
}

const id = await sendMessage({ embeds: SAMPLES.map(e => buildEmbed(e)) });
console.log(`Mensaje de prueba enviado (id ${id}). Revisa el canal.`);
