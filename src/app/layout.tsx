import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "题芽 MathSprout · AI 数学错题本",
  description: "拍一张照片，AI 诊断错因、启发讲解、举一反三。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "题芽", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#16a34a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh">
        <header className="sticky top-0 z-10 border-b border-sprout-100 bg-white/90 backdrop-blur">
          <nav className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold text-sprout-700">🌱 题芽</Link>
            <div className="flex gap-2 text-sm">
              <Link href="/" className="rounded-lg px-3 py-1.5 hover:bg-sprout-50">今日</Link>
              <Link href="/mistakes" className="rounded-lg px-3 py-1.5 hover:bg-sprout-50">错题库</Link>
              <Link href="/capture" className="rounded-lg bg-sprout-600 px-3 py-1.5 font-semibold text-white">📷 录题</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-5 pb-24">{children}</main>
      </body>
    </html>
  );
}
