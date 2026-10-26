"use client";

/** fetch() wrapper that attaches the family passcode stored in localStorage (see FAMILY_PASSCODE). */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const code = typeof window !== "undefined" ? localStorage.getItem("family_passcode") : null;
  if (code) headers.set("x-family-passcode", code);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 && typeof window !== "undefined") {
    const entered = window.prompt("请输入家庭口令");
    if (entered) {
      localStorage.setItem("family_passcode", entered);
      document.cookie = `family_passcode=${encodeURIComponent(entered)}; path=/; max-age=31536000; SameSite=Lax`;
      return apiFetch(input, init);
    }
  }
  return res;
}
