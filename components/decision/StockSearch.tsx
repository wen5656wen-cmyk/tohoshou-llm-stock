"use client";

// ── 股票搜索（P16-02 · 任意股票入口）─────────────────────────────────────────
// 复用现有 /api/stocks?q=（symbol/name/nameZh/nameEn contains）——不建第二套数据源。
// 输入代码/中日英名 → 下拉最多 8 条 → 点击/Enter 打开 AI Research Report（任意股票）。
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/components/ui";
import { fmtJpy, fmtPct } from "@/lib/decision/ds";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function StockSearch({ onPick, focusSignal = 0 }: { onPick: (symbol: string, name: string) => void; focusSignal?: number }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 外部「加入持仓」触发聚焦搜索框
  useEffect(() => {
    if (focusSignal > 0 && inputRef.current) { inputRef.current.focus(); inputRef.current.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }, [focusSignal]);

  useEffect(() => {
    const term = q.trim();
    let alive = true;
    const id = setTimeout(async () => {
      if (!alive) return;
      if (term.length < 1) { setRows([]); setOpen(false); setLoading(false); return; }
      setLoading(true);
      const r = await fetch(`/api/stocks?q=${encodeURIComponent(term)}&limit=8`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (!alive) return;
      setRows(Array.isArray(r?.stocks) ? r.stocks : []); setOpen(true); setSel(0); setLoading(false);
    }, term.length < 1 ? 0 : 220);
    return () => { alive = false; clearTimeout(id); };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (r: any) => { if (!r) return; onPick(r.symbol, r.nameZh || r.name || r.symbol); setQ(""); setRows([]); setOpen(false); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); return; }
    if (!open || !rows.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(rows[sel]); }
  };

  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%", maxWidth: 460 }}>
      <input
        ref={inputRef}
        value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} onFocus={() => { if (rows.length) setOpen(true); }}
        placeholder={t("dv.search.placeholder")}
        style={{ width: "100%", height: 44, padding: "0 14px", fontSize: 13, border: `1px solid ${COLORS.border}`, borderRadius: 9, background: "#fff", color: COLORS.text }}
      />
      {open && (
        <div style={{ position: "absolute", top: 48, left: 0, right: 0, background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.12)", zIndex: 70, overflow: "hidden", maxHeight: 360, overflowY: "auto" }}>
          {rows.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 12.5, color: COLORS.textFaint }}>{loading ? "…" : t("dv.search.noResult")}</div>
          ) : rows.map((r, i) => (
            <div key={r.symbol} onMouseEnter={() => setSel(i)} onClick={() => pick(r)}
              className="flex items-center gap-2 cursor-pointer"
              style={{ padding: "8px 12px", background: i === sel ? "#F1F6FF" : "#fff", borderBottom: `1px solid ${COLORS.borderSoft ?? "#F0F0F3"}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{r.symbol}</div>
                <div className="truncate" style={{ fontSize: 11, color: COLORS.textFaint }}>{r.nameZh || r.name}</div>
              </div>
              <div className="tabular-nums" style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, color: COLORS.text }}>{r.price != null ? fmtJpy(r.price) : "—"}</div>
                <div style={{ fontSize: 11, color: (r.changeRate ?? 0) < 0 ? COLORS.danger : COLORS.success }}>{r.changeRate != null ? fmtPct(r.changeRate) : ""}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
