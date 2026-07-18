"use client";

// ── 用户持仓数据 hook（P16-01）──────────────────────────────────────────────
// 只读拉取 /api/holdings（持仓+估值+动作+汇总）与 /api/holdings/history（平仓历史）。
// refresh() 在买入/卖出/编辑/删除后重新拉取，驱动整页刷新。
import { useCallback, useEffect, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function useHoldings() {
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    const g = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    (async () => {
      const [h, hist] = await Promise.all([g("/api/holdings"), g("/api/holdings/history")]);
      if (!alive) return;
      setData(h); setHistory(hist);
    })();
    return () => { alive = false; };
  }, [nonce]);

  return { data, history, refresh };
}
