import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmbed, formatPrice, COLOR_ANNOUNCED, COLOR_ON_SALE } from '../src/services/notifications/embeds.js';

const NOW = new Date('2026-08-11T09:00:00.000Z');

function makeEvent(extra = {}) {
  return {
    event_type: 'announced',
    series_id: 1,
    volume_number: 9,
    price: 9.5,
    pages: 200,
    release_date: 'Noviembre 2026',
    cover_url: 'https://static.listadomanga.com/cover',
    series_name: 'Kagurabachi',
    author: 'Takeru Hokazono',
    editorial_es: 'Norma Editorial',
    series_url: 'https://www.listadomanga.es/coleccion.php?id=1',
    total_volumes: 9,
    released_volumes: 8,
    owned_count: 8,
    missing_count: 1,
    in_wishlist: 0,
    ...extra
  };
}

test('formatPrice usa formato español y descarta valores vacíos', () => {
  assert.equal(formatPrice(9.5), '9,50 €');
  assert.equal(formatPrice(16), '16,00 €');
  assert.equal(formatPrice(0), null);
  assert.equal(formatPrice(null), null);
});

test('la tarjeta de anuncio va en ámbar, con miniatura y fecha prevista', () => {
  const embed = buildEmbed(makeEvent(), { now: NOW });

  assert.equal(embed.color, COLOR_ANNOUNCED);
  assert.equal(embed.author.name, '📢 Nuevo tomo anunciado');
  assert.equal(embed.title, 'Kagurabachi #9');
  assert.equal(embed.url, 'https://www.listadomanga.es/coleccion.php?id=1');
  assert.equal(embed.thumbnail.url, 'https://static.listadomanga.com/cover');
  assert.equal(embed.image, undefined);
  assert.equal(embed.timestamp, NOW.toISOString());

  const fields = Object.fromEntries(embed.fields.map(f => [f.name, f.value]));
  assert.equal(fields['Editorial'], 'Norma Editorial');
  assert.equal(fields['Precio'], '9,50 €');
  assert.equal(fields['Salida prevista'], 'Noviembre 2026');
  assert.equal(fields['Tu colección'], 'Tienes 8 de 9 tomos');
  assert.equal(embed.footer.text, 'Takeru Hokazono');
});

test('la tarjeta de venta va en verde, con portada grande y tomos pendientes', () => {
  const embed = buildEmbed(makeEvent({ event_type: 'on_sale', missing_count: 3 }), { now: NOW });

  assert.equal(embed.color, COLOR_ON_SALE);
  assert.equal(embed.author.name, '🛒 Ya a la venta');
  assert.equal(embed.image.url, 'https://static.listadomanga.com/cover');
  assert.equal(embed.thumbnail, undefined);

  const fields = Object.fromEntries(embed.fields.map(f => [f.name, f.value]));
  assert.equal(fields['Páginas'], '200');
  assert.equal(fields['Pendiente'], 'Te faltan 3 tomos de esta serie');
  assert.equal(fields['Salida prevista'], undefined);
});

test('la wishlist se indica en el pie', () => {
  const embed = buildEmbed(makeEvent({ in_wishlist: 1 }), { now: NOW });
  assert.equal(embed.footer.text, 'Takeru Hokazono · ⭐ En tu wishlist');
});

test('sin portada, sin precio y sin fecha la tarjeta se construye igual', () => {
  const embed = buildEmbed(
    makeEvent({ cover_url: null, price: 0, release_date: null, pages: 0, author: null }),
    { now: NOW }
  );

  assert.equal(embed.thumbnail, undefined);
  assert.equal(embed.image, undefined);
  assert.equal(embed.footer, undefined);
  const names = embed.fields.map(f => f.name);
  assert.ok(!names.includes('Precio'));
  assert.ok(!names.includes('Salida prevista'));
});

test('el contexto de colección se omite si no se conoce el total', () => {
  const embed = buildEmbed(makeEvent({ total_volumes: 0, released_volumes: 0 }), { now: NOW });
  const names = embed.fields.map(f => f.name);
  assert.ok(!names.includes('Tu colección'));
});
