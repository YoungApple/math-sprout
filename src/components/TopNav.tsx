"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TopNav() {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  return (
    <header className="sticky top-0 z-10 border-b border-sprout-100 bg-white/95 backdrop-blur">
      <nav className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link href={isLogin ? "/login" : "/"} className="flex items-center gap-1.5 text-lg font-bold text-sprout-700">
          <span>🌱</span>
          <span>题芽</span>
        </Link>
        {!isLogin && (
          <div className="flex items-center gap-1.5 text-sm">
            <Link
              href="/"
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                pathname === "/" ? "bg-sprout-100 text-sprout-700" : "text-slate-600 hover:bg-sprout-50"
              }`}
            >
              今日
            </Link>
            <Link
              href="/mistakes"
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                pathname.startsWith("/mistakes") ? "bg-sprout-100 text-sprout-700" : "text-slate-600 hover:bg-sprout-50"
              }`}
            >
              错题库
            </Link>
            <Link
              href="/capture"
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                pathname.startsWith("/capture")
                  ? "bg-sprout-700 text-white ring-2 ring-sprout-500/30"
                  : "bg-sprout-600 text-white hover:bg-sprout-700"
              }`}
            >
              📝 批改/录题
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
