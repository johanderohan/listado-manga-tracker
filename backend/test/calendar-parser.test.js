import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCalendar } from '../src/services/calendar/parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const agosto = readFileSync(join(here, 'fixtures/calendario-agosto.html'), 'utf-8');
const septiembre = readFileSync(join(here, 'fixtures/calendario-septiembre.html'), 'utf-8');

test('solo salen las entradas marcadas, y el total las cuenta todas', () => {
  const { entries, totalEntries } = parseCalendar(agosto);

  assert.equal(totalEntries, 7);
  assert.equal(entries.length, 6); // Ao Ashi nº38 no está marcada
  assert.ok(!entries.some(e => e.titulo.includes('Ao Ashi')));
});

test('NOVEDAD es nuevaSerie y NÚMERO ÚNICO es unico', () => {
  const { entries } = parseCalendar(agosto);
  const daiDark = entries.find(e => e.titulo.startsWith('Dai Dark'));
  const guia = entries.find(e => e.titulo.startsWith('Ataque a los Titanes'));

  assert.equal(daiDark.tipo, 'nuevaSerie');
  assert.equal(guia.tipo, 'unico');
});

test('cada entrada hereda editorial, fecha y categoría de su bloque', () => {
  const { entries } = parseCalendar(agosto);
  const daiDark = entries.find(e => e.titulo.startsWith('Dai Dark'));
  const figuras = entries.find(e => e.titulo.startsWith('My Hero Academia'));

  assert.equal(daiDark.editorial, 'Norma Editorial');
  assert.equal(daiDark.fecha, '2026-08-14');
  assert.equal(daiDark.categoria, 'Seinen');

  assert.equal(figuras.editorial, 'Planeta DeAgostini');
  assert.equal(figuras.fecha, '2026-08-18');
  assert.equal(figuras.categoria, 'Miniaturas y figuras');
});

test('las entidades HTML se decodifican en título y autores', () => {
  const { entries } = parseCalendar(agosto);
  const guia = entries.find(e => e.titulo.startsWith('Ataque'));

  assert.equal(guia.titulo, 'Ataque a los Titanes: Guía Final (Edición Coleccionista)');
  assert.deepEqual(guia.autores, ['Hajime Isayama']);
});

test('varios autores se recogen todos', () => {
  const { entries } = parseCalendar(agosto);
  const ochenta = entries.find(e => e.titulo.startsWith('86'));
  assert.deepEqual(ochenta.autores, ['Asato Asato', 'Shirabii']);
});

test('la portada se cruza por id de serie y falta sin romper', () => {
  const { entries } = parseCalendar(agosto);
  const daiDark = entries.find(e => e.titulo.startsWith('Dai Dark'));
  const sinPortada = entries.find(e => e.titulo.startsWith('86'));

  assert.equal(daiDark.portadaUrl, 'https://static.listadomanga.com/daidark.jpg');
  assert.equal(sinPortada.portadaUrl, null);
});

test('cada entrada trae su enlace absoluto a la ficha', () => {
  const { entries } = parseCalendar(agosto);
  const daiDark = entries.find(e => e.titulo.startsWith('Dai Dark'));

  assert.equal(daiDark.seriesId, 6444);
  assert.equal(daiDark.url, 'https://www.listadomanga.es/coleccion.php?id=6444');
});

test('un segundo mes se parsea igual', () => {
  const { entries, totalEntries } = parseCalendar(septiembre);

  assert.equal(totalEntries, 1);
  assert.equal(entries[0].fecha, '2026-09-03');
  assert.equal(entries[0].editorial, 'Milky Way Ediciones');
});

test('una página sin entradas devuelve vacío sin lanzar', () => {
  const { entries, totalEntries } = parseCalendar('<html><body><p>Vaya</p></body></html>');

  assert.deepEqual(entries, []);
  assert.equal(totalEntries, 0);
});
