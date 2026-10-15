import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CommandFailedError, runCommand, runCommandWithTimeout } from '../server/services/ffmpeg-runner.js';

describe('runCommandWithTimeout', () => {
  it('rechaza y mata el proceso cuando se pasa del timeout', async () => {
    const started = Date.now();
    await expect(runCommandWithTimeout('node', ['-e', 'setTimeout(() => {}, 10000)'], 200)).rejects.toThrow(/tiempo de espera|timed out/i);
    // El proceso se mata de inmediato: no se espera a que termine solo.
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('no deja procesos vivos tras el timeout', async () => {
    const marker = join(mkdtempSync(join(tmpdir(), 'runner-')), 'late.txt');
    await expect(
      runCommandWithTimeout(
        'node',
        ['-e', `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x'), 1500)`],
        150,
      ),
    ).rejects.toThrow(CommandFailedError);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(existsSync(marker)).toBe(false);
  });

  it('resuelve cuando el comando termina bien y captura la salida si se pide', async () => {
    await expect(runCommandWithTimeout('node', ['-e', 'process.exit(0)'], 5000)).resolves.toBeUndefined();
    const result = await runCommand('node', ['-e', "console.log('hola')"], { timeoutMs: 5000, capture: true });
    expect(result.stdout.trim()).toBe('hola');
  });

  it('rechaza con el código de salida cuando el comando falla', async () => {
    await expect(runCommand('node', ['-e', 'process.exit(3)'], { timeoutMs: 5000 })).rejects.toThrow(/código 3/);
  });

  it('rechaza con un error claro si el binario no existe', async () => {
    await expect(runCommand('binario-que-no-existe-1234', [], { timeoutMs: 1000 })).rejects.toThrow(CommandFailedError);
  });
});

describe('captura de salida', () => {
  it('no revienta con salidas grandes', async () => {
    const result = await runCommand('node', ['-e', "process.stdout.write('a'.repeat(200000))"], { timeoutMs: 5000, capture: true });
    expect(result.stdout.length).toBeGreaterThan(0);
    expect(result.stdout.length).toBeLessThanOrEqual(64_000);
  });

  it('puede ejecutarse con cwd explícito', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'runner-cwd-'));
    writeFileSync(join(directory, 'marca.txt'), 'x');
    const result = await runCommand('node', ['-e', 'process.stdout.write(process.cwd())'], {
      timeoutMs: 5000,
      capture: true,
      cwd: directory,
    });
    expect(result.stdout).toBe(directory);
  });
});
