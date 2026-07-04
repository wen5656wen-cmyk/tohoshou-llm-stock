"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { stockDetail, stockSearchApi } from "@/lib/routes";
import { Search } from "./icons";

type Hit = {
  symbol: string; name: string; nameZh: string | null; nameEn: string | null;
  price: number | null; changeRate: number | null;
};

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  const run = useCallback(async (term: string) => {
    const t = term.trim();
    if (!t) { setHits([]); setState("idle"); return; }
    const seq = ++seqRef.current;
    setState("loading");
    try {
      const res = await fetch(stockSearchApi(t, 6), { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (seq !== seqRef.current) return; // stale response
      setHits(Array.isArray(data.stocks) ? data.stocks : []);
      setActive(0);
      setState("done");
    } catch {
      if (seq !== seqRef.current) return;
      setState("error");
    }
  }, []);

  // Debounced query
  useEffect(() => {
    const id = setTimeout(() => run(q), 220);
    return () => clearTimeout(id);
  }, [q, run]);

  // Click-outside to close
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    router.push(stockDetail(h.symbol));
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { if (hits[active]) go(hits[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  const C = { ink: "#1D1D1F", sub: "#6E6E73", faint: "#86868B", line: "#ECECEC", green: "#34C759", red: "#FF3B30", blue: "#007AFF" };

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-full px-4 h-10 dash-card"
        style={{ minWidth: 200 }}>
        <Search size={16} />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="搜索股票…"
          aria-label="搜索股票"
          className="bg-transparent outline-none text-[13px] w-full"
          style={{ color: C.ink }}
        />
      </div>

      {open && q.trim() && (
        <div className="absolute right-0 mt-2 w-[340px] max-w-[86vw] rounded-2xl overflow-hidden z-50 dash-card"
          style={{ boxShadow: "0 16px 40px -12px rgba(0,0,0,0.24)" }}>
          {state === "loading" && (
            <div className="p-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="skeleton" style={{ width: 48, height: 14 }} />
                  <div className="skeleton flex-1" style={{ height: 14 }} />
                </div>
              ))}
            </div>
          )}
          {state === "error" && (
            <div className="px-4 py-5 text-center">
              <div className="text-[13px] mb-2" style={{ color: C.sub }}>搜索出错</div>
              <button onClick={() => run(q)} className="text-[13px] font-semibold" style={{ color: C.blue }}>重试</button>
            </div>
          )}
          {state === "done" && hits.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px]" style={{ color: C.faint }}>未找到相关股票</div>
          )}
          {state === "done" && hits.length > 0 && (
            <div className="py-1.5">
              {hits.map((h, i) => {
                const up = h.changeRate != null && h.changeRate > 0;
                const down = h.changeRate != null && h.changeRate < 0;
                const cc = up ? C.green : down ? C.red : C.faint;
                return (
                  <button
                    key={h.symbol}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h)}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left"
                    style={{ background: i === active ? "#F4F4F6" : "transparent" }}
                  >
                    <span className="text-[12px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md shrink-0"
                      style={{ color: C.sub, background: "#F0F0F3" }}>{h.symbol}</span>
                    <span className="text-[13px] font-medium flex-1 truncate" style={{ color: C.ink }}>
                      {h.nameZh || h.name}
                    </span>
                    {h.price != null && (
                      <span className="text-[12px] font-semibold tabular-nums" style={{ color: cc }}>
                        {h.changeRate != null ? `${up ? "+" : ""}${h.changeRate.toFixed(2)}%` : `¥${h.price.toLocaleString()}`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
