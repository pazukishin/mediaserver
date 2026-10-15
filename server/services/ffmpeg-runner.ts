import { spawn } from 'node:child_process';

/** Tope de salida capturada: evita que un log enorme se coma la memoria. */
const MAX_CAPTURE = 64_000;

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export type CommandOptions = {
  timeoutMs: number;
  /** `false` (por defecto) descarta stdout/stderr y sólo importa el código. */
  capture?: boolean;
  cwd?: string;
};

export class CommandFailedError extends Error {
  override readonly name = 'CommandFailedError';
  readonly command: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;

  constructor(
    command: string,
    message: string,
    options: { exitCode?: number | null; signal?: NodeJS.Signals | null; timedOut?: boolean } = {},
  ) {
    super(message);
    this.command = command;
    this.exitCode = options.exitCode ?? null;
    this.signal = options.signal ?? null;
    this.timedOut = options.timedOut ?? false;
  }
}

/**
 * Ejecuta un comando externo con timeout duro: al vencer se envía `SIGKILL` al
 * proceso hijo, de modo que nunca queda un ffmpeg colgado consumiendo CPU.
 */
export function runCommand(command: string, args: string[], options: CommandOptions): Promise<CommandResult> {
  const { timeoutMs, capture = false, cwd } = options;
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'ignore',
      ...(cwd ? { cwd } : {}),
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_CAPTURE) stdout = (stdout + chunk.toString('utf8')).slice(0, MAX_CAPTURE);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_CAPTURE) stderr = (stderr + chunk.toString('utf8')).slice(0, MAX_CAPTURE);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, timeoutMs);

    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    child.on('error', (error) => {
      settle(() => reject(new CommandFailedError(command, `${command} no se pudo ejecutar: ${error.message}`)));
    });

    child.on('close', (code, signal) => {
      settle(() => {
        if (timedOut) {
          reject(
            new CommandFailedError(command, `${command} agotó el tiempo de espera (${timeoutMs} ms) y fue terminado`, {
              exitCode: code,
              signal,
              timedOut: true,
            }),
          );
          return;
        }
        if (signal && signal !== 'SIGTERM') {
          reject(new CommandFailedError(command, `${command} terminó por señal ${signal}`, { exitCode: code, signal }));
          return;
        }
        if (code !== 0) {
          reject(new CommandFailedError(command, `${command} terminó con código ${code ?? 'null'}`, { exitCode: code, signal }));
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  });
}

/**
 * Compatibilidad con el runner anterior: resuelve sin salida cuando el comando
 * termina bien y rechaza (matando el proceso) si se pasa del timeout.
 */
export async function runCommandWithTimeout(command: string, args: string[], timeoutMs: number): Promise<void> {
  await runCommand(command, args, { timeoutMs });
}
