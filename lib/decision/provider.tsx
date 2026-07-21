"use client";

// ── DecisionProvider · Decision 层数据层（P14-DEV-01 · Freeze 必改④）─────────────
// 进入 Decision 工作区一次拉取共享数据（closing-decision / decision-center / ai-theme），
// 经 React Context 供五页复用 —— 消除跨页重复请求（现 closing 4×→1×）。
// 页面独有数据（AI推荐 watchlist、持仓/历史 indicators）仍页内拉取，不进本 Provider。
// 纯前端展示层：只读复用现有 API，零后端/评分/Schema 改动。

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// 松类型：字段以现有 API 返回为准，页面各自细化
export interface ClosingData {
  ok?: boolean; empty?: boolean; date?: string; decidedAtJst?: string | null;
  verdict?: "BUY_TODAY" | "WATCH_ONLY" | "STAY_CASH"; verdictReason?: string | null; summary?: string | null;
  market?: { regime?: string | null; volatility?: number | null; qualifiedCount?: number | null; avgAiScore?: number | null; buyZoneHitRate?: number | null } | null;
  top1?: Record<string, unknown> | null; portfolio?: Record<string, unknown>[]; top10?: Record<string, unknown>[];
  availableDates?: string[]; meta?: Record<string, unknown> | null;
}
export interface MarketData {
  ok?: boolean;
  market?: { regime?: string | null; riskLevel?: string | null; volatility?: number | null; topix?: number | null; topixChange?: number | null; nikkei?: number | null; nikkeiChange?: number | null; asOf?: string | null; regimeAsOf?: string | null; trendDegraded?: boolean | null } | null;
}
export interface ThemeData { stocks?: { symbol: string; theme: string; return5d: number | null; return20d?: number | null; scored: boolean }[]; themes?: { theme: string }[] }
// P15-01B：决策总览唯一聚合入口（/api/admin/decision-overview）。字段以 API 返回为准，
// 页面细化。松类型 —— 仅决策总览页消费，其它四页仍用 closing/market/themes。
export type OverviewData = Record<string, unknown> & { ok?: boolean; empty?: boolean };

interface DecisionContextValue {
  date: string | null;
  setDate: (d: string) => void;
  closing: ClosingData | null;
  market: MarketData | null;
  themes: ThemeData | null;
  overview: OverviewData | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => void;
}

const Ctx = createContext<DecisionContextValue>({
  date: null, setDate: () => {}, closing: null, market: null, themes: null, overview: null,
  loading: true, error: null, lastUpdated: null, refresh: () => {},
});

export function DecisionProvider({ initialDate, children }: { initialDate?: string; children: ReactNode }) {
  const [date, setDateState] = useState<string | null>(initialDate ?? null);
  const [closing, setClosing] = useState<ClosingData | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [themes, setThemes] = useState<ThemeData | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const dateRef = useRef<string | null>(initialDate ?? null);

  const setDate = useCallback((d: string) => { dateRef.current = d; setDateState(d); }, []);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    const get = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    (async () => {
      setLoading(true); setError(null);
      const q = date ? `?date=${encodeURIComponent(date)}` : "";
      try {
        const [cj, mj, tj, oj] = await Promise.all([
          get(`/api/admin/closing-decision${q}`),
          get(`/api/admin/decision-center`),
          get(`/api/ai-theme`),
          get(`/api/admin/decision-overview${q}`),
        ]);
        if (!alive) return;
        setClosing(cj && !cj.empty ? cj : (cj ?? null));
        setMarket(mj); setThemes(tj); setOverview(oj);
        setLastUpdated(new Date().toISOString());
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "load failed"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [date, nonce]);

  return (
    <Ctx.Provider value={{ date, setDate, closing, market, themes, overview, loading, error, lastUpdated, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDecision() { return useContext(Ctx); }
