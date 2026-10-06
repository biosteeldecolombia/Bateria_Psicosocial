import type { MeResponse } from '@sanithelp/shared';

let csrf = '';
export const setCsrf = (t: string) => {
  csrf = t;
};

export const getCsrf = () => csrf;

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
  }
}

export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Ocurrió un error. Intenta de nuevo.', data);
  if (data?.csrfToken) setCsrf(data.csrfToken);
  return data as T;
}

export const getMe = () => api<MeResponse>('GET', '/api/auth/me');
