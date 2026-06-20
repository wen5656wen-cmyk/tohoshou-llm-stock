"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/",          label: "首页",   icon: "◈" },
  { href: "/ai-picks",  label: "AI推荐", icon: "✦" },
  { href: "/chat",      label: "对话",   icon: "💬" },
  { href: "/screener",  label: "筛选",   icon: "◫" },
  { href: "/ai-theme",  label: "产业链", icon: "⚡" },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0f1629] border-t border-slate-700/50"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[52px] transition-colors ${
                active ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="text-lg leading-none mb-0.5">{icon}</span>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
