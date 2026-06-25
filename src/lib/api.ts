import { getAuth } from 'firebase/auth';

export const BASE = import.meta.env.VITE_API_URL ?? '';

// Resolves a file_path returned by the API into an absolute URL. New uploads
// return a relative /api/files/download/<id> path; since the frontend and
// backend can be on different origins in production, BASE must be prepended.
export function fileUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${BASE}${path}`;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const user = getAuth().currentUser;
  const token = user ? await user.getIdToken() : null;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${BASE}${path}`, { ...init, headers });
}
