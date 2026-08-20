import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * BigInt no es serializable a JSON y un Number pierde precision con montos
 * grandes en pesos, asi que todo monto sale como string por el borde de la API.
 */
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return new NextResponse(JSON.stringify(data, replacer), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init?.headers ?? {}) },
  });
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, details);
export const unauthorized = (msg = 'Necesitas iniciar sesion') => new ApiError(401, msg);
export const forbidden = (msg = 'No tienes acceso a esto') => new ApiError(403, msg);
export const notFound = (msg = 'No encontramos eso') => new ApiError(404, msg);
export const conflict = (msg: string) => new ApiError(409, msg);

/**
 * Envuelve un handler para que ningun error se escape como stack trace.
 * Los mensajes estan escritos para que la app los pueda mostrar tal cual.
 */
export function handler<T extends unknown[]>(
  fn: (request: Request, ...args: T) => Promise<Response>,
) {
  return async (request: Request, ...args: T): Promise<Response> => {
    try {
      return await fn(request, ...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return json({ error: error.message, details: error.details }, { status: error.status });
      }
      if (error instanceof ZodError) {
        const first = error.errors[0];
        return json(
          {
            error: first ? `${first.path.join('.')}: ${first.message}` : 'Datos invalidos',
            details: error.errors,
          },
          { status: 400 },
        );
      }
      console.error('[api] error no controlado', error);
      const message = error instanceof Error ? error.message : 'Algo salio mal';
      return json({ error: message }, { status: 500 });
    }
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest('El cuerpo de la peticion no es JSON valido');
  }
}
