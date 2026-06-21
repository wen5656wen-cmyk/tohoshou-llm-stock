import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import ResponsiveShell from "@/components/mobile/ResponsiveShell";
import { I18nProvider } from "@/lib/i18n";
import HtmlLangSync from "@/components/HtmlLangSync";
import PageTransition from "@/components/PageTransition";

export const metadata: Metadata = {
  title: "TOHOSHOU AI | 日本AI选股系统",
  description: "基于AI的日本股票分析与精选系统",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh">
      <body className="min-h-screen bg-[#f8f9fb]">
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
