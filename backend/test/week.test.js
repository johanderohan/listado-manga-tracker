import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  announcedWeek, monthsForWindow, formatRange, formatShortDay,
  msUntilNextSunday, isCatchUpWindow, toIso
} from '../src/services/calendar/week.js';

// 2026-08-09 es domingo; 2026-08-10, lunes.
const DOMINGO = new Date(2026, 7, 9, 19, 0, 0);
const LUNES = new Date(2026, 7, 10, 9, 0, 0);
const MIERCOLES = new Date(2026, 7, 12, 9, 0, 0);

test('el domingo se anuncia la semana que empieza mañana', () => {
  const w = announcedWeek(DOMINGO);
  assert.equal(w.startIso, '2026-08-10');
  assert.equal(w.endIso, '2026-08-16');
});

test('el lunes se anuncia la semana que empieza hoy', () => {
  assert.equal(announcedWeek(LUNES).startIso, '2026-08-10');
});

test('el resto de días se anuncia el lunes siguiente', () => {
  assert.equal(announcedWeek(MIERCOLES).startIso, '2026-08-17');
});

test('una semana dentro de un mes pide un solo mes', () => {
  assert.deepEqual(monthsForWindow(announcedWeek(DOMINGO)), [{ mes: 8, ano: 2026 }]);
});

test('una semana a caballo de dos meses pide los dos', () => {
  // 2026-08-30 es domingo: la semana va del 31 de agosto al 6 de septiembre.
  const w = announcedWeek(new Date(2026, 7, 30, 19, 0, 0));
  assert.equal(w.startIso, '2026-08-31');
  assert.equal(w.endIso, '2026-09-06');
  assert.deepEqual(monthsForWindow(w), [{ mes: 8, ano: 2026 }, { mes: 9, ano: 2026 }]);
});

test('una semana a caballo de dos años pide los dos', () => {
  // 2026-12-27 es domingo: semana del 28 de diciembre al 3 de enero.
  const w = announcedWeek(new Date(2026, 11, 27, 19, 0, 0));
  assert.deepEqual(monthsForWindow(w), [{ mes: 12, ano: 2026 }, { mes: 1, ano: 2027 }]);
});

test('el rango se escribe en español, con un solo mes o con dos', () => {
  assert.equal(formatRange(announcedWeek(DOMINGO)), 'del 10 al 16 de agosto');
  assert.equal(
    formatRange(announcedWeek(new Date(2026, 7, 30, 19, 0, 0))),
    'del 31 de agosto al 6 de septiembre'
  );
});

test('el día corto lleva abreviatura y número', () => {
  assert.equal(formatShortDay('2026-08-14'), 'vie 14');
  assert.equal(formatShortDay('2026-08-12'), 'mié 12');
});

test('toIso usa la fecha local, no UTC', () => {
  assert.equal(toIso(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});

test('msUntilNextSunday apunta al domingo siguiente a la hora dada', () => {
  // Miércoles 12 → domingo 16 a las 19:00.
  const ms = msUntilNextSunday(MIERCOLES, 19);
  const destino = new Date(MIERCOLES.getTime() + ms);
  assert.equal(destino.getDay(), 0);
  assert.equal(destino.getHours(), 19);
  assert.equal(toIso(destino), '2026-08-16');
});

test('si ya pasó la hora del domingo, salta al domingo siguiente', () => {
  const domingoTarde = new Date(2026, 7, 9, 20, 0, 0);
  const destino = new Date(domingoTarde.getTime() + msUntilNextSunday(domingoTarde, 19));
  assert.equal(toIso(destino), '2026-08-16');
});

test('la ventana de recuperación cubre del domingo por la tarde al lunes', () => {
  assert.equal(isCatchUpWindow(new Date(2026, 7, 9, 19, 30)), true);
  assert.equal(isCatchUpWindow(LUNES), true);
  assert.equal(isCatchUpWindow(new Date(2026, 7, 9, 12, 0)), false);
  assert.equal(isCatchUpWindow(MIERCOLES), false);
});
