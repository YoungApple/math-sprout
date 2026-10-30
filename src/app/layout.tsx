import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "题芽 MathSprout · AI 数学错题本",
  description: "拍一张照片，AI 诊断错因、启发讲解、举一反三。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "题芽", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16a34a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh">
        <TopNav />
        <main className="mx-auto max-w-2xl px-4 py-5 pb-24">{children}</main>
      </body>
    </html>
  );
}
