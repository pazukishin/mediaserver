import { describe, expect, test } from 'vitest';
import { formatClock, formatDuration, formatPercent, formatRelative, formatRemaining, plural } from './format.js';

describe('formatClock', () => {
  test('usa mm:ss por debajo de una hora y h:mm:ss por encima', () => {
    expect(formatClock(0)).toBe('');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(3661)).toBe('1:01:01');
  });

  test('no inventa duraciones cuando el dato falta', () => {
    expect(formatClock(0)).toBe('');
    expect(formatClock(Number.NaN)).toBe('');
    expect(formatClock(-5)).toBe('');
  });
});

describe('formatDuration', () => {
  test('elige la unidad legible', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(4320)).toBe('1 h 12 min');
  });
});

describe('formatRemaining', () => {
  test('resta la posición de la duración', () => {
    expect(formatRemaining(60, 300)).toBe('Quedan 4 min');
  });

  test('no devuelve nada si no hay duración', () => {
    expect(formatRemaining(60, 0)).toBe('');
  });
});

describe('plural', () => {
  test('concuerda singular y plural', () => {
    expect(plural(1, 'archivo')).toBe('1 archivo');
    expect(plural(0, 'archivo')).toBe('0 archivos');
    expect(plural(3, 'canal', 'canales')).toBe('3 canales');
  });
});

describe('formatPercent', () => {
  test('acota entre 0 y 100', () => {
    expect(formatPercent(0.5)).toBe('50 %');
    expect(formatPercent(4)).toBe('100 %');
    expect(formatPercent(-1)).toBe('0 %');
    expect(formatPercent(Number.NaN)).toBe('0 %');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-03-10T12:00:00.000Z');

  test('describe hoy, ayer y días', () => {
    expect(formatRelative('2026-03-10T09:00:00.000Z', now)).toBe('hoy');
    expect(formatRelative('2026-03-09T09:00:00.000Z', now)).toBe('ayer');
    expect(formatRelative('2026-03-06T09:00:00.000Z', now)).toBe('hace 4 días');
    expect(formatRelative('2026-02-20T09:00:00.000Z', now)).toBe('hace 2 semanas');
    expect(formatRelative('2025-01-01T09:00:00.000Z', now)).toBe('hace 1 año');
  });

  test('tolera valores vacíos o inválidos', () => {
    expect(formatRelative(null, now)).toBe('');
    expect(formatRelative('no es una fecha', now)).toBe('');
  });
});
