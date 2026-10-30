"use client";

/** fetch() wrapper: on 401 (session cookie missing/expired) redirect to /login with current path + query. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== "undefined") {
    const current = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/login?next=${encodeURIComponent(current)}`;
  }
  return res;
}
