import { getAuth } from 'firebase/auth';

const BASE = import.meta.env.VITE_API_URL ?? '';

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
