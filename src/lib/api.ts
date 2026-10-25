import type { PlayerSession } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/api`;

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

export async function callApi<T>(
  action: string,
  payload: Record<string, unknown> = {},
  session?: PlayerSession | null,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    const headers: Record<string, string> = {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    };

    if (session) {
      headers['x-player-id'] = session.playerId;
      headers['x-player-token'] = session.token;
    }

    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    });

    const json = (await response.json().catch(() => null)) as ApiResponse<T> | null;

    if (!response.ok || !json?.ok || json.data === undefined) {
      throw new ApiError(
        json?.error?.code ?? 'UNKNOWN',
        json?.error?.message ?? 'No se pudo completar la operación.',
        response.status,
      );
    }

    return json.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('TIMEOUT', 'La conexión tardó demasiado. Intenta de nuevo.');
    }
    throw new ApiError(
      'NETWORK',
      'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}
