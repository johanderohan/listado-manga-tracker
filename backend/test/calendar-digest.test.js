import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrarRelevantes, enVentana, buildDigestEmbed, COLOR_DIGEST } from '../src/services/calendar/digest.js';
import { announcedWeek } from '../src/services/calendar/week.js';

const VENTANA = announcedWeek(new Date(2026, 7, 9, 19, 0, 0)); // 10 → 16 agosto
const NOW = new Date(2026, 7, 9, 19, 0, 0);

function entrada(extra = {}) {
  return {
    seriesId: 1,
    titulo: 'Dai Dark',
    tipo: 'nuevaSerie',
    fecha: '2026-08-14',
    editorial: 'Norma Editorial',
    categoria: 'Seinen',
    autores: ['Q-Hayashida'],
    portadaUrl: 'https://static.listadomanga.com/daidark.jpg',
    url: 'https://www.listadomanga.es/coleccion.php?id=1',
    ...extra
  };
}

test('se descartan las miniaturas y figuras', () => {
  const out = filtrarRelevantes([
    entrada(),
    entrada({ titulo: 'Figuras oficiales nº1', categoria: 'Miniaturas y figuras' })
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].titulo, 'Dai Dark');
});

test('se descartan packs y sobrecubiertas alternativas', () => {
  const out = filtrarRelevantes([
    entrada(),
    entrada({ titulo: 'Hisoka Returns! - Pack tomos 1 y 2' }),
    entrada({ titulo: 'Horobi (MangaLine) - Sobrecubierta Alternativa' }),
    entrada({ titulo: 'Bajo el cielo azul (Pack Keiko Nagita)' })
  ]);
  assert.deepEqual(out.map(e => e.titulo), ['Dai Dark']);
});

test('no se descartan novelas ligeras ni ensayos', () => {
  const out = filtrarRelevantes([
    entrada({ titulo: '86 -Eighty-Six-', categoria: 'Novelas Ligeras' }),
    entrada({ titulo: 'Mazinger Z: El legado', categoria: 'Ensayo' })
  ]);
  assert.equal(out.length, 2);
});

test('el filtro de Pack no se lleva por delante palabras que lo contienen', () => {
  const out = filtrarRelevantes([entrada({ titulo: 'Packard Historias' })]);
  assert.equal(out.length, 1);
});

test('la ventana excluye lo anterior y lo posterior', () => {
  const out = enVentana([
    entrada({ fecha: '2026-08-09' }),
    entrada({ fecha: '2026-08-10' }),
    entrada({ fecha: '2026-08-16' }),
    entrada({ fecha: '2026-08-17' })
  ], VENTANA);
  assert.deepEqual(out.map(e => e.fecha), ['2026-08-10', '2026-08-16']);
});

test('el embed agrupa por tipo, cuenta y ordena por fecha y título', () => {
  const embed = buildDigestEmbed({
    entries: [
      entrada({ titulo: 'Zeta', fecha: '2026-08-14' }),
      entrada({ titulo: 'Alfa', fecha: '2026-08-14' }),
      entrada({ titulo: 'Dogsred', fecha: '2026-08-12' }),
      entrada({ titulo: 'Único', tipo: 'unico', fecha: '2026-08-13' })
    ],
    window: VENTANA,
    now: NOW
  });

  assert.equal(embed.color, COLOR_DIGEST);
  assert.equal(embed.title, '🗓️ Salidas del 10 al 16 de agosto');

  const [series, unicos] = embed.fields;
  assert.equal(series.name, '📘 Empiezan serie (3)');
  assert.match(series.value.split('\n')[0], /Dogsred.*mié 12/);
  assert.match(series.value.split('\n')[1], /Alfa.*vie 14/);
  assert.match(series.value.split('\n')[2], /Zeta.*vie 14/);
  assert.equal(unicos.name, '📗 Números únicos (1)');
  assert.equal(embed.footer.text, '4 novedades · listadomanga.es');
});

test('la línea lleva enlace, editorial y día corto', () => {
  const embed = buildDigestEmbed({ entries: [entrada()], window: VENTANA, now: NOW });
  assert.equal(
    embed.fields[0].value,
    '• [Dai Dark](https://www.listadomanga.es/coleccion.php?id=1) · Norma Editorial · vie 14'
  );
});

test('un bloque vacío no aparece', () => {
  const embed = buildDigestEmbed({
    entries: [entrada({ tipo: 'unico' })],
    window: VENTANA,
    now: NOW
  });
  assert.equal(embed.fields.length, 1);
  assert.equal(embed.fields[0].name, '📗 Números únicos (1)');
});

test('la miniatura sale de la primera serie nueva', () => {
  const embed = buildDigestEmbed({
    entries: [
      entrada({ titulo: 'Tardía', fecha: '2026-08-15', portadaUrl: 'https://x/tardia.jpg' }),
      entrada({ titulo: 'Pronta', fecha: '2026-08-11', portadaUrl: 'https://x/pronta.jpg' })
    ],
    window: VENTANA,
    now: NOW
  });
  assert.equal(embed.thumbnail.url, 'https://x/pronta.jpg');
});

test('sin series nuevas, la miniatura sale del primer único; sin portada, no hay miniatura', () => {
  const conUnico = buildDigestEmbed({
    entries: [entrada({ tipo: 'unico', portadaUrl: 'https://x/u.jpg' })],
    window: VENTANA, now: NOW
  });
  assert.equal(conUnico.thumbnail.url, 'https://x/u.jpg');

  const sinPortada = buildDigestEmbed({
    entries: [entrada({ portadaUrl: null })],
    window: VENTANA, now: NOW
  });
  assert.equal(sinPortada.thumbnail, undefined);
});

test('semana vacía: texto corto y sin bloques', () => {
  const embed = buildDigestEmbed({ entries: [], window: VENTANA, now: NOW });

  assert.equal(embed.title, '🗓️ Sin nuevas series ni números únicos del 10 al 16 de agosto');
  assert.deepEqual(embed.fields, []);
  assert.equal(embed.thumbnail, undefined);
});

test('un bloque largo se recorta, cuenta el resto y respeta el límite de Discord', () => {
  const muchas = Array.from({ length: 20 }, (_, i) =>
    entrada({ titulo: `Serie ${String(i).padStart(2, '0')}`, seriesId: i })
  );
  const embed = buildDigestEmbed({ entries: muchas, window: VENTANA, now: NOW });
  const lineas = embed.fields[0].value.split('\n');
  const mostradas = lineas.length - 1;

  assert.ok(embed.fields[0].value.length <= 1024);
  assert.ok(mostradas > 0 && mostradas <= 15);
  assert.equal(lineas.at(-1), `…y ${20 - mostradas} más`);
  assert.equal(embed.fields[0].name, '📘 Empiezan serie (20)');
});

test('con títulos al máximo caben menos líneas, pero nunca se pasa de 1024', () => {
  const largas = Array.from({ length: 20 }, (_, i) =>
    entrada({ titulo: `${'B'.repeat(60)} ${i}`, seriesId: i })
  );
  const embed = buildDigestEmbed({ entries: largas, window: VENTANA, now: NOW });

  assert.ok(embed.fields[0].value.length <= 1024);
  assert.match(embed.fields[0].value.split('\n').at(-1), /^…y \d+ más$/);
});

test('un título larguísimo se recorta a 60 caracteres', () => {
  const largo = 'A'.repeat(90);
  const embed = buildDigestEmbed({ entries: [entrada({ titulo: largo })], window: VENTANA, now: NOW });

  assert.match(embed.fields[0].value, /A{59}…/);
});
