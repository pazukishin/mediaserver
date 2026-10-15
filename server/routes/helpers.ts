import { z } from 'zod';

export class HttpError extends Error {
  override readonly name = 'HttpError';
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Convierte los errores de Zod en 400 con mensaje en español. */
export function validationError(error: z.ZodError): HttpError {
  const detail = error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ');
  return new HttpError(400, `Parámetros no válidos (${detail})`);
}

export function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
export type IdParam = z.infer<typeof idParamSchema>;

export const previewQuerySchema = z.object({ index: z.coerce.number().int().min(0).max(4).default(0) });

export const artworkQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  channel: z.string().trim().min(1).optional(),
});

export const loginBodySchema = z.object({
  username: z.string().min(1, 'el usuario es obligatorio'),
  password: z.string().min(1, 'la contraseña es obligatoria'),
});

export const progressBodySchema = z.object({
  position: z.number().finite().min(0),
  duration: z.number().finite().min(0).optional(),
});

export const watchedBodySchema = z.object({ watched: z.boolean() });
export const favoriteBodySchema = z.object({ favorite: z.boolean() });
export const resetBodySchema = z.object({ scope: z.enum(['progress', 'watched', 'favorite', 'all']) });

export const itemsQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  channel: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  filter: z.enum(['all', 'unwatched', 'watched', 'favorite', 'progress']).default('all'),
  sort: z.enum(['name', 'created', 'added', 'duration', 'watched']).default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ItemsQueryInput = z.infer<typeof itemsQuerySchema>;
