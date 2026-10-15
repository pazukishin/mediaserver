import type { FastifyInstance } from 'fastify';

export async function registerScanRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/scan', async (_request, reply) => {
    const result = app.scanner.start();
    if (!result.accepted) return reply.code(409).send({ error: result.reason ?? 'Ya hay un escaneo en curso' });
    return { accepted: true, startedAt: result.startedAt };
  });

  app.get('/api/scan/status', async () => app.scanner.status());

  app.post('/api/scan/cancel', async () => ({ accepted: app.scanner.cancel() }));
}
