"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "仪表盘", icon: "◈" },
  { href: "/stocks", label: "股票列表", icon: "◉" },
  { href: "/indicators", label: "技术指标", icon: "▣" },
  { href: "/ai-picks", label: "AI推荐", icon: "✦" },
  { href: "/ai-theme", label: "AI产业链", icon: "⚡" },
  { href: "/screener", label: "全市场筛选", icon: "◫" },
  { href: "/sectors", label: "行业分析", icon: "▤" },
  { href: "/watchlist", label: "自选股", icon: "★" },
  { href: "/news", label: "新闻资讯", icon: "◎" },
  { href: "/portfolio", label: "持仓管理", icon: "◇" },
  { href: "/notifications", label: "通知管理", icon: "🔔" },
  { href: "/sync", label: "数据同步", icon: "⟳" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-56 bg-[#0f1629] flex flex-col z-40">
      <div className="px-5 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-xl text-blue-400">◈</span>
          <div>
            <div className="text-white font-bold text-sm leading-tight">
              TOHOSHOU AI
            </div>
            <div className="text-slate-500 text-xs">日本AI选股系统</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                active
                  ? "bg-blue-600/20 text-blue-300 font-medium"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/30"
              }`}
            >
              <span className="text-base w-5 text-center">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-slate-700/50">
        <div className="text-slate-600 text-xs">
          数据来源
          <div className="mt-1.5 space-y-0.5">
            {["J-Quants", "Yahoo Finance JP", "TDnet"].map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <span className="text-slate-500 text-xs">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
