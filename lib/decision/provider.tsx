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

// ── 加载状态模型（P21-P0-Boss）────────────────────────────────────────────────
//
// 修复前这里是：`fetch(u).then(r => r.ok ? r.json() : null).catch(() => null)`
// —— HTTP 状态码被整体丢弃，401 / 500 / 网络中断与「今天真的没数据」全部塌缩成 null，
// 页面一律渲染「暂无今日决策数据」。
//
// 那是一句**假话**：P21-S1 给 /api/admin/* 加上鉴权后，未登录浏览器拿到的是 401，
// 数据库里今日决策（BUY_TODAY）完好无损，页面却告诉老板「没有数据」。
// 排查方向被这句文案带偏到数据管线，而真正的原因在鉴权层。
//
// 因此：**状态必须分辨，HTTP 状态码必须保留**。
export type LoadStatus = "READY" | "EMPTY" | "UNAUTHORIZED" | "SERVER_ERROR" | "NETWORK_ERROR";

export interface Loaded<T> {
  status: LoadStatus;
  /** 原始 HTTP 状态码；网络异常（请求未拿到响应）时为 null。 */
  httpStatus: number | null;
  data: T | null;
}

/**
 * 决策数据取数的唯一入口。**禁止再在别处写 `r.ok ? r.json() : null`** ——
 * 那正是本次 P0 的成因。首页与工作台都从这里取，保证状态语义只有一套。
 */
export async function fetchDecision<T = Record<string, unknown>>(url: string): Promise<Loaded<T>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  } catch {
    // 请求根本没拿到响应：断网、DNS、CORS、被中断
    return { status: "NETWORK_ERROR", httpStatus: null, data: null };
  }

  if (res.status === 401 || res.status === 403) return { status: "UNAUTHORIZED", httpStatus: res.status, data: null };
  // 5xx 与其余非 2xx（400/404/503…）都归为「暂时无法加载」——共同点是：
  // 服务端没能给出数据，而这**不等于**没有数据。绝不可显示成「暂无数据」。
  if (!res.ok) return { status: "SERVER_ERROR", httpStatus: res.status, data: null };

  let j: unknown;
  try {
    j = await res.json();
  } catch {
    return { status: "SERVER_ERROR", httpStatus: res.status, data: null };
  }

  const o = j as { empty?: boolean; ok?: boolean } | null;
  // 只有「服务端 200 且明确表示没有内容」才是真正的 EMPTY
  if (o?.empty === true || o?.ok === false) return { status: "EMPTY", httpStatus: res.status, data: j as T };
  return { status: "READY", httpStatus: res.status, data: j as T };
}

/** 多个请求合并成一个页面状态：越需要用户处理的越优先暴露，不被 READY 掩盖。 */
const SEVERITY: Record<LoadStatus, number> = {
  UNAUTHORIZED: 4, NETWORK_ERROR: 3, SERVER_ERROR: 2, EMPTY: 1, READY: 0,
};
export function worstStatus(...list: LoadStatus[]): LoadStatus {
  return list.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a), "READY" as LoadStatus);
}

interface DecisionContextValue {
  date: string | null;
  setDate: (d: string) => void;
  closing: ClosingData | null;
  market: MarketData | null;
  themes: ThemeData | null;
  overview: OverviewData | null;
  /** 页面级加载状态（三个决策接口的最严重状态）。渲染前必须先判它。 */
  status: LoadStatus;
  /** 决定 status 的那个响应的 HTTP 码，供诊断用；不直接展示给用户。 */
  httpStatus: number | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => void;
}

const Ctx = createContext<DecisionContextValue>({
  date: null, setDate: () => {}, closing: null, market: null, themes: null, overview: null,
  status: "READY", httpStatus: null, loading: true, error: null, lastUpdated: null, refresh: () => {},
});

export function DecisionProvider({ initialDate, children }: { initialDate?: string; children: ReactNode }) {
  const [date, setDateState] = useState<string | null>(initialDate ?? null);
  const [closing, setClosing] = useState<ClosingData | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [themes, setThemes] = useState<ThemeData | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [status, setStatus] = useState<LoadStatus>("READY");
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const dateRef = useRef<string | null>(initialDate ?? null);

  const setDate = useCallback((d: string) => { dateRef.current = d; setDateState(d); }, []);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      const q = date ? `?date=${encodeURIComponent(date)}` : "";
      try {
        const [c, m, th, o] = await Promise.all([
          fetchDecision<ClosingData>(`/api/admin/closing-decision${q}`),
          fetchDecision<MarketData>(`/api/admin/decision-center`),
          fetchDecision<ThemeData>(`/api/ai-theme`),
          fetchDecision<OverviewData>(`/api/admin/decision-overview${q}`),
        ]);
        if (!alive) return;
        // 页面状态只由三个决策接口决定；ai-theme 是配角，它的失败不该让整页变成登录页
        const st = worstStatus(c.status, m.status, o.status);
        setStatus(st);
        setHttpStatus([c, m, o].find((r) => r.status === st)?.httpStatus ?? null);
        setClosing(c.data); setMarket(m.data); setThemes(th.data); setOverview(o.data);
        setLastUpdated(new Date().toISOString());
      } catch (e) { if (alive) { setStatus("SERVER_ERROR"); setError(e instanceof Error ? e.message : "load failed"); } }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [date, nonce]);

  return (
    <Ctx.Provider value={{ date, setDate, closing, market, themes, overview, status, httpStatus, loading, error, lastUpdated, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDecision() { return useContext(Ctx); }
