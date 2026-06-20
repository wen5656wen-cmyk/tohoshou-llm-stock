"use client";

import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/": "仪表盘",
  "/ai-picks": "AI推荐",
  "/chat": "AI对话",
  "/ai-theme": "AI产业链",
  "/screener": "全市场筛选",
  "/sync": "数据同步",
  "/notifications": "通知管理",
  "/stocks": "股票列表",
  "/watchlist": "自选股",
  "/news": "新闻资讯",
  "/portfolio": "持仓管理",
  "/indicators": "技术指标",
  "/sectors": "行业分析",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith("/stocks/")) return "个股详情";
  if (pathname.startsWith("/ai-theme/")) return "产业链详情";
  return "TOHOSHOU AI";
}

export default function MobileHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#0f1629] border-b border-slate-700/50 h-14 flex items-center px-4 gap-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-blue-400 text-lg shrink-0">◈</span>
        <div className="min-w-0">
          <div className="text-white font-bold text-sm leading-tight">TOHOSHOU AI</div>
          <div className="text-slate-400 text-[11px] truncate">{title}</div>
        </div>
      </div>
      <button
        onClick={onMenuClick}
        className="shrink-0 w-10 h-10 flex items-center justify-center text-slate-300 hover:text-white rounded-lg hover:bg-slate-700/50 transition-colors"
        aria-label="导航菜单"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </header>
  );
}
