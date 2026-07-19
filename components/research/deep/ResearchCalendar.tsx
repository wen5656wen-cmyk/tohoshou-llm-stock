"use client";

// 研究日历（P17 Track 1）· 月/列表视图 · 与产业详情 Timeline 同源 · Trigger/Review/Publish/Daily/Weekly/Future Review
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AppLoading } from "@/components/ui";
import { COLORS } from "@/lib/decision/ds";
import ResearchSubNav from "./ResearchSubNav";

/* eslint-disable @typescript-eslint/no-explicit-any */
const KIND: Record<string, string> = { HISTORICAL: COLORS.textSecondary, FORECAST: COLORS.purple, PLANNED: COLORS.primary, TRIGGER: COLORS.warning, REVIEW: COLORS.success, PUBLISH: "#0E7A55", DAILY: COLORS.textMuted, WEEKLY: COLORS.primary, FUTURE_REVIEW: "#FF7A1A" };
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export default function ResearchCalendar() {
  const { t, lang } = useI18n();
  const [view, setView] = useState<"month" | "list">("month");
  const [month, setMonth] = useState<Date>(() => new Date(2026, 6, 1)); // 固定初值避免 SSR 抖动；挂载后校正
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("");

  useEffect(() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); }, []);
  useEffect(() => {
    setLoading(true);
    const q = view === "month" ? `?month=${ymd(month)}` : "";
    fetch(`/api/research/calendar${q}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { setD(j); setLoading(false); }).catch(() => setLoading(false));
  }, [month, view]);

  const events = useMemo(() => (d?.events ?? []).filter((e: any) => !kind || e.kind === kind), [d, kind]);
  const byDay = useMemo(() => { const m: Record<string, any[]> = {}; for (const e of events) (m[String(e.date).slice(0, 10)] ??= []).push(e); return m; }, [events]);
  const nm = (e: any) => (lang === "ja-JP" ? e.industryNameJa : e.industryName) ?? e.industryKey ?? "";

  // 月网格
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5" style={{ color: COLORS.text }}>
      <ResearchSubNav />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>🗓️ {t("dr.nav.calendar")}</h1>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {(["month", "list"] as const).map((v) => <button key={v} onClick={() => setView(v)} style={{ fontSize: 12, fontWeight: view === v ? 700 : 500, padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", color: view === v ? "#fff" : COLORS.text, background: view === v ? COLORS.primary : COLORS.tile }}>{t(v === "month" ? "dr.cal.month" : "dr.cal.list")}</button>)}
        </div>
      </div>

      {/* kind 筛选 */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, fontSize: 10.5 }}>
        <button onClick={() => setKind("")} style={{ padding: "3px 9px", borderRadius: 6, border: "none", cursor: "pointer", background: !kind ? COLORS.text : COLORS.tile, color: !kind ? "#fff" : COLORS.textMuted }}>All {events.length ? `(${d?.events?.length ?? 0})` : ""}</button>
        {Object.keys(KIND).map((k) => (d?.counts?.[k] ? <button key={k} onClick={() => setKind(kind === k ? "" : k)} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 6, border: `1px solid ${kind === k ? KIND[k] : COLORS.border}`, cursor: "pointer", background: COLORS.card, color: COLORS.textSecondary }}><span style={{ width: 8, height: 8, borderRadius: 4, background: KIND[k] }} />{k} {d.counts[k]}</button> : null))}
      </div>

      {loading ? <AppLoading label="calendar" /> : view === "month" ? (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 10 }}>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={{ fontSize: 16, background: "none", border: "none", cursor: "pointer", color: COLORS.primary }}>‹</button>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{month.getFullYear()}-{String(month.getMonth() + 1).padStart(2, "0")}</span>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={{ fontSize: 16, background: "none", border: "none", cursor: "pointer", color: COLORS.primary }}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
            {WD.map((w) => <div key={w} style={{ fontSize: 10, color: COLORS.textFaint, textAlign: "center", fontWeight: 600 }}>{w}</div>)}
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const ds = `${ymd(month)}-${String(day).padStart(2, "0")}`;
              const evs = byDay[ds] ?? [];
              const isToday = ds === todayStr;
              return (
                <div key={i} style={{ minHeight: 76, borderRadius: 9, border: `1px solid ${isToday ? COLORS.primary : COLORS.border}`, background: isToday ? `${COLORS.primary}0c` : COLORS.card, padding: "5px 6px", overflow: "hidden" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? COLORS.primary : COLORS.textMuted }}>{day}</div>
                  {evs.slice(0, 3).map((e: any) => (
                    <div key={e.id} title={`${e.kind} · ${e.title}`} style={{ fontSize: 8.5, marginTop: 2, padding: "1px 4px", borderRadius: 4, background: `${KIND[e.kind]}1f`, color: KIND[e.kind], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div>
                  ))}
                  {evs.length > 3 && <div style={{ fontSize: 8.5, color: COLORS.textFaint, marginTop: 1 }}>+{evs.length - 3}</div>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: "hidden" }}>
          {events.length === 0 ? <div style={{ padding: "34px 0", textAlign: "center", fontSize: 12, color: COLORS.textFaint }}>{t("dr.lib.empty")}</div>
            : events.map((e: any, i: number) => (
              <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 15px", borderTop: i ? `1px solid ${COLORS.borderSoft}` : "none" }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: KIND[e.kind], background: `${KIND[e.kind]}18`, borderRadius: 5, padding: "2px 7px", minWidth: 92, textAlign: "center", ...(e.kind === "FORECAST" ? { border: `1px dashed ${COLORS.purple}` } : {}) }}>{e.kind}</span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 12.5 }}>{e.title}</div>{nm(e) && <div style={{ fontSize: 10, color: COLORS.textFaint }}>{nm(e)}</div>}</div>
                <span style={{ fontSize: 10.5, color: COLORS.textFaint }}>{String(e.date).slice(0, 10)}</span>
              </div>
            ))}
        </div>
      )}

      {/* Today Changed */}
      {d?.todayChanged?.length ? (
        <div style={{ marginTop: 16, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "13px 15px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>🆕 {t("dr.cal.today")} <span style={{ fontSize: 11, color: COLORS.textFaint }}>{d.todayChanged.length}</span></div>
          {d.todayChanged.slice(0, 8).map((e: any) => <div key={e.id} style={{ fontSize: 11.5, padding: "3px 0", borderTop: `1px solid ${COLORS.borderSoft}` }}><span style={{ color: KIND[e.kind], fontWeight: 700 }}>{e.kind}</span> · {e.title} <span style={{ color: COLORS.textFaint }}>{nm(e)}</span></div>)}
        </div>
      ) : null}
    </div>
  );
}
