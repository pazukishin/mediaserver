import { describe, expect, test } from 'vitest';
import { createLoginThrottle, MAX_LOGIN_FAILURES } from '../server/services/login-throttle.js';

/** Reloj manual para no depender del tiempo real. */
function makeClock(start = 0) {
  let value = start;
  return { now: () => value, advance: (ms: number) => (value += ms) };
}

describe('limitador de intentos de acceso', () => {
  test('bloquea al alcanzar el máximo de fallos', () => {
    const throttle = createLoginThrottle();

    for (let attempt = 0; attempt < MAX_LOGIN_FAILURES; attempt += 1) {
      expect(throttle.isBlocked('10.0.0.1')).toBe(false);
      throttle.recordFailure('10.0.0.1');
    }

    expect(throttle.isBlocked('10.0.0.1')).toBe(true);
    expect(throttle.retryAfterSeconds('10.0.0.1')).toBeGreaterThan(0);
  });

  test('cada IP tiene su propio contador', () => {
    const throttle = createLoginThrottle();
    for (let attempt = 0; attempt < MAX_LOGIN_FAILURES; attempt += 1) throttle.recordFailure('10.0.0.1');

    expect(throttle.isBlocked('10.0.0.1')).toBe(true);
    expect(throttle.isBlocked('10.0.0.2')).toBe(false);
  });

  test('un acceso correcto limpia el contador', () => {
    const throttle = createLoginThrottle();
    for (let attempt = 0; attempt < MAX_LOGIN_FAILURES - 1; attempt += 1) throttle.recordFailure('10.0.0.1');
    throttle.clear('10.0.0.1');

    for (let attempt = 0; attempt < MAX_LOGIN_FAILURES - 1; attempt += 1) {
      throttle.recordFailure('10.0.0.1');
      expect(throttle.isBlocked('10.0.0.1')).toBe(false);
    }
  });

  test('la ventana caduca y vuelve a permitir intentos', () => {
    const clock = makeClock();
    const throttle = createLoginThrottle({ windowMs: 60_000, now: clock.now });

    for (let attempt = 0; attempt < MAX_LOGIN_FAILURES; attempt += 1) throttle.recordFailure('10.0.0.1');
    expect(throttle.isBlocked('10.0.0.1')).toBe(true);

    clock.advance(59_000);
    expect(throttle.isBlocked('10.0.0.1')).toBe(true);

    clock.advance(2_000);
    expect(throttle.isBlocked('10.0.0.1')).toBe(false);
    expect(throttle.retryAfterSeconds('10.0.0.1')).toBe(0);
  });

  test('la ventana no se amplía con cada fallo nuevo', () => {
    const clock = makeClock();
    const throttle = createLoginThrottle({ windowMs: 60_000, now: clock.now });

    throttle.recordFailure('10.0.0.1');
    clock.advance(50_000);
    throttle.recordFailure('10.0.0.1');

    clock.advance(11_000); // 61 s desde el PRIMER fallo
    expect(throttle.isBlocked('10.0.0.1')).toBe(false);
  });
});
