"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { finalScoreHex } from "@/lib/rec-config";
import { ChevronDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from "@/components/dashboard/icons";

export const C = {
  blue: "#007AFF", green: "#34C759", red: "#FF3B30", amber: "#FF9F0A",
  ink: "#1D1D1F", sub: "#6E6E73", faint: "#86868B", line: "#ECECEC",
};

// Unified z-index scale — Modal > Dropdown > Tooltip > Card.
// Popovers render through a body Portal, so they always sit above page content
// regardless of any ancestor stacking context (`.dash-in` transform) or overflow.
export const Z = { CARD: 1, STICKY: 100, TOOLTIP: 9000, DROPDOWN: 9500, MODAL: 10000 } as const;

// ── ScoreRing (Apple Activity Ring) ───────────────────────────────────────────
export function ScoreRing({ score, size = 66, stroke = 6 }: { score: number | null; size?: number; stroke?: number }) {
  const s = score != null && Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = s ?? 0;
  const col = finalScoreHex(s);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEEEF1" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1)" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-semibold tabular-nums leading-none" style={{ fontSize: size * 0.36, color: C.ink }}>{s ?? "—"}</span>
      </div>
    </div>
  );
}

// ── Segmented control (Apple) ─────────────────────────────────────────────────
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; color?: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex p-1 rounded-full flex-wrap gap-0.5" style={{ background: "#F0F0F3", border: `1px solid ${C.line}` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            className="px-3.5 h-8 rounded-full text-[13px] font-medium transition-all duration-200 whitespace-nowrap"
            style={active
              ? { background: "#fff", color: o.color ?? C.ink, boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }
              : { background: "transparent", color: C.sub }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Dropdown (Apple, Portal popover) ──────────────────────────────────────────
// The menu renders into a body Portal at `position: fixed` coords derived from the
// trigger's bounding box. This guarantees it paints above every card / header /
// sidebar and is never clipped by an ancestor `overflow:hidden` or trapped inside
// a `.dash-in` transform stacking context.
export function Dropdown<T extends string>({ value, options, onChange, width = 150, icon }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; width?: number; icon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const estH = Math.min(320, options.length * 34 + 12);
    const spaceBelow = window.innerHeight - r.bottom;
    // Flip above the trigger when there isn't room below and there is room above.
    const top = spaceBelow < estH + 12 && r.top > estH + 12 ? r.top - 8 - estH : r.bottom + 8;
    setPos({ top, left: r.left, width: r.width });
  };

  // Recompute position synchronously before paint whenever it opens.
  useLayoutEffect(() => { if (open) place(); }, [open]);

  // Keep aligned while open (scroll/resize); close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cur = options.find((o) => o.value === value) ?? options[0];

  const menu = open && pos && mounted
    ? createPortal(
        <div
          ref={menuRef}
          className="rounded-2xl overflow-hidden dash-card py-1.5 overflow-y-auto"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, maxHeight: 320, zIndex: Z.DROPDOWN, boxShadow: "0 16px 44px -12px rgba(0,0,0,0.26)" }}
          role="listbox"
        >
          {options.map((o) => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
              role="option" aria-selected={o.value === value}
              className="w-full text-left px-3.5 py-2 text-[13px] font-medium transition-colors"
              style={{ background: o.value === value ? "#F4F4F6" : "transparent", color: o.value === value ? C.blue : C.ink }}>
              {o.label}
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="relative" style={{ width }}>
      <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 h-10 px-3.5 rounded-xl text-[13px] font-medium dash-int dash-card"
        style={{ color: C.ink }}>
        <span className="flex items-center gap-2 truncate">
          {icon && <span style={{ color: C.faint }}><SlidersHorizontal size={15} /></span>}
          <span className="truncate">{cur?.label}</span>
        </span>
        <span style={{ color: C.faint, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}><ChevronDown size={15} /></span>
      </button>
      {menu}
    </div>
  );
}

// ── Search bar (Apple, ⌘K) ────────────────────────────────────────────────────
export function SearchBar({ value, onChange, inputRef, placeholder }: {
  value: string; onChange: (v: string) => void; inputRef?: React.RefObject<HTMLInputElement | null>; placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full px-4 h-11 dash-card" style={{ width: 300, maxWidth: "100%" }}>
      <span style={{ color: C.faint }}><Search size={16} /></span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="搜索股票"
        className="bg-transparent outline-none text-[14px] flex-1 min-w-0"
        style={{ color: C.ink }}
      />
      {value ? (
        <button onClick={() => onChange("")} className="text-[13px]" style={{ color: C.faint }} aria-label="清除">✕</button>
      ) : (
        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md tabular-nums" style={{ color: C.faint, background: "#F0F0F3" }}>⌘K</span>
      )}
    </div>
  );
}

// ── Pagination (Apple) ────────────────────────────────────────────────────────
export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages: (number | "…")[] = [];
  const push = (p: number | "…") => pages.push(p);
  const win = 1;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - win && p <= page + win)) push(p);
    else if (pages[pages.length - 1] !== "…") push("…");
  }
  const btn = "inline-flex items-center justify-center h-9 min-w-9 px-3 rounded-xl text-[13px] font-semibold transition-all duration-200";
  return (
    <div className="flex items-center justify-center gap-1.5 mt-10">
      <button disabled={page === 1} onClick={() => onChange(page - 1)}
        className={`${btn} dash-card dash-int disabled:opacity-40 disabled:pointer-events-none`} style={{ color: C.sub }} aria-label="上一页">
        <ChevronLeft size={16} />
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1 text-[13px]" style={{ color: C.faint }}>…</span>
        ) : (
          <button key={p} onClick={() => onChange(p)}
            className={`${btn} ${p === page ? "" : "dash-card dash-int"}`}
            style={p === page ? { background: C.blue, color: "#fff" } : { color: C.sub }}>
            {p}
          </button>
        )
      )}
      <button disabled={page === totalPages} onClick={() => onChange(page + 1)}
        className={`${btn} dash-card dash-int disabled:opacity-40 disabled:pointer-events-none`} style={{ color: C.sub }} aria-label="下一页">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ── Empty / Loading states ────────────────────────────────────────────────────
export function EmptyState({ text }: { text: string }) {
  return (
    <div className="dash-card py-16 text-center col-span-full">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: "#F4F4F6", color: C.faint }}>
        <Search size={26} />
      </div>
      <div className="text-[15px] font-medium" style={{ color: C.sub }}>{text}</div>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="dash-card p-5" style={{ height: 210 }}>
          <div className="skeleton" style={{ width: "60%", height: 18, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: "40%", height: 12, marginBottom: 20 }} />
          <div className="flex items-center gap-3">
            <div className="skeleton" style={{ width: 60, height: 60, borderRadius: "50%" }} />
            <div className="flex-1">
              <div className="skeleton" style={{ width: "70%", height: 14, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: "50%", height: 12 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Market badge (Prime / Standard / Growth) ──────────────────────────────────
export function MktBadge({ mkt }: { mkt: string | null }) {
  if (!mkt) return null;
  const label = mkt.includes("プライム") ? "Prime" : mkt.includes("スタンダード") ? "Standard" : mkt.includes("グロース") ? "Growth" : null;
  if (!label) return null;
  const color = label === "Prime" ? "#5856D6" : label === "Standard" ? C.blue : C.green;
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ color, background: `${color}14` }}>{label}</span>
  );
}
