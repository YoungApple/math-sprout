"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode: code }) });
    setBusy(false);
    if (res.ok) router.replace(params.get("next") || "/");
    else setError("口令不对，再试一次");
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-10 max-w-sm space-y-4 text-center">
      <div className="text-4xl">🌱</div>
      <h1 className="text-lg font-bold">欢迎来到题芽</h1>
      <p className="text-sm text-slate-500">请输入家庭口令</p>
      <input
        autoFocus type="password" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)}
        className="w-full rounded-xl border border-slate-200 px-3 py-3 text-center text-lg tracking-widest"
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !code}>进入</button>
    </form>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
