"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const NAV_ITEMS = [
  { href: "/",             label: "仪表盘",     icon: "◈" },
  { href: "/ai-picks",     label: "AI推荐",     icon: "✦" },
  { href: "/chat",         label: "AI对话",     icon: "💬" },
  { href: "/ai-theme",     label: "AI产业链",   icon: "⚡" },
  { href: "/screener",     label: "全市场筛选", icon: "◫" },
  { href: "/stocks",       label: "股票列表",   icon: "◉" },
  { href: "/indicators",   label: "技术指标",   icon: "▣" },
  { href: "/watchlist",    label: "自选股",     icon: "★" },
  { href: "/news",         label: "新闻资讯",   icon: "◎" },
  { href: "/notifications",label: "通知管理",   icon: "🔔" },
  { href: "/sync",         label: "数据同步",   icon: "⟳" },
];

export default function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-[60]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="关闭菜单"
      />
      {/* Drawer panel */}
      <div className="absolute top-0 left-0 h-full w-72 max-w-[85vw] bg-[#0f1629] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-blue-400 text-lg">◈</span>
            <div>
              <div className="text-white font-bold text-sm">TOHOSHOU AI</div>
              <div className="text-slate-500 text-xs">日本AI选股系统</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/50 transition-colors"
            aria-label="关闭"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Nav list */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all ${
                  active
                    ? "bg-blue-600/20 text-blue-300 font-medium"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/30"
                }`}
              >
                <span className="text-base w-5 text-center shrink-0">{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-slate-700/50 shrink-0">
          <div className="text-slate-600 text-xs font-medium mb-2">数据来源</div>
          <div className="space-y-1">
            {["J-Quants", "Yahoo Finance JP", "TDnet", "Kabutan"].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                <span className="text-slate-500 text-xs">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
