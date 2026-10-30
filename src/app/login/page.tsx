"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function sanitizeClientNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/";
  }
  return next;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode: code }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        router.replace(sanitizeClientNextPath(params.get("next")));
        router.refresh();
      } else {
        setError(data.error ?? "口令不对，再试一次");
      }
    } catch {
      setError("网络异常，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-10 max-w-sm space-y-4 text-center">
      <div className="text-4xl">🌱</div>
      <div>
        <h1 className="text-lg font-bold">欢迎来到题芽 MathSprout</h1>
        <p className="mt-1 text-xs text-slate-500">拍一道错题 · 找准思维卡点 · 3 道变式通关</p>
      </div>
      <div className="relative">
        <input
          autoFocus
          type={showCode ? "text" : "password"}
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="current-password"
          placeholder="请输入家庭口令"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-3 pr-12 text-center text-lg tracking-widest focus:border-sprout-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShowCode((v) => !v)}
          aria-label={showCode ? "隐藏口令" : "显示口令"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
        >
          {showCode ? "隐藏" : "显示"}
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy || !code.trim()}>
        {busy ? "验证中…" : "进入错题本"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
