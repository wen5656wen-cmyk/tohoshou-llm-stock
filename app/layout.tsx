import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import ResponsiveShell from "@/components/mobile/ResponsiveShell";
import { I18nProvider } from "@/lib/i18n";
import HtmlLangSync from "@/components/HtmlLangSync";
import PageTransition from "@/components/PageTransition";

export const metadata: Metadata = {
  title: "TOHOSHOU AI | 日本AI选股系统",
  description: "基于AI的日本股票分析与精选系统",
  applicationName: "TOHOSHOU AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "TOHOSHOU AI" },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1677FF",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh">
      <body className="min-h-screen bg-[#fafafa]">
        <I18nProvider>
          <HtmlLangSync />
          <Sidebar />
          <ResponsiveShell>
            {/* pt-14 = mobile header height (56px); pb-20 = mobile bottom nav (80px incl. safe area) */}
            <main className="md:ml-56 min-h-screen pt-14 md:pt-0 pb-20 md:pb-0">
              <PageTransition>{children}</PageTransition>
            </main>
          </ResponsiveShell>
        </I18nProvider>
      </body>
    </html>
  );
}
