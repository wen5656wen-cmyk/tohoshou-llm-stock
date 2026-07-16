"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { mobileBottomNodes, workspaceForPath, isNavActive } from "@/lib/navigation/nav-config";

// P7-04A：底栏显示当前工作区节点（老板恰 4，其余最多 5），与桌面同源。
export default function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const ws = workspaceForPath(pathname);
  const items = mobileBottomNodes(ws);

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0f1629] border-t border-slate-700/50"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch">
        {items.map((node) => {
          const active = isNavActive(node.href, pathname);
          return (
            <Link
              key={node.key}
              href={node.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[52px] transition-colors ${
                active ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="text-lg leading-none mb-0.5">{node.glyph}</span>
              <span className="text-[10px] font-medium">{t(node.labelKey as Parameters<typeof t>[0])}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
