"use client";

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────
type VersionRole = "current" | "baseline" | "legacy";
type VersionEntry = {
  id: string; modelVersion: string; scoreVersion: string; schemaVersion: string; ruleEngineVer: string; scoringSchemaVer: string; llmModelVer: string;
  startDate: string; endDate: string | null; isBaseline: boolean; changeLog: string | null; experimentId: string | null; createdAt: string;
  role: VersionRole; drLinked: number; bpLinked: number; learningReportExists: boolean;
};
type Integrity = { drTotal: number; drLinked: number; drMissingCount: number; drCoveragePct: number; bpTotal: number; bpLinked: number; bpMissingCount: number; bpCoveragePct: number; status: "OK" | "WARNING" | "CRITICAL" };
type HorizonRow = { horizon: string; sampleCount: number; filledCount: number; winCount: number; avgReturn: number | null; avgAlpha: number | null; winRate: number | null };
type CompareResult = {
  versionA: { id: string; schemaVersion: string; modelVersion: string; startDate: string }; versionB: { id: string; schemaVersion: string; modelVersion: string; startDate: string };
  comparisonAllowed: boolean; reason: string | null; tradingDaysA: number; tradingDaysB: number; featureCoverageA: number | null; featureCoverageB: number | null;
  backtestA: HorizonRow[]; backtestB: HorizonRow[]; backtestDelta: Array<{ horizon: string; winRateDelta: number | null; returnDelta: number | null; alphaDelta: number | null }> | null; winRateDelta7d: number | null; regressionStatus: string;
};
type TimelineEntry =
  | { type: "VERSION"; date: string; id: string; schemaVersion: string; modelVersion: string; role: string; tradingDays: number; sampleCount: number; learningReportExists: boolean; regressionStatus: string | null; changeLog: string | null; isBaseline: boolean }
  | { type: "EXPERIMENT"; date: string; id: string; status: string; hypothesis: string; decision: string | null; versionSnapshotId: string | null }
  | { type: "DEPLOYMENT"; date: string; id: number; commitHash: string; summary: string; buildStatus: string; healthStatus: string; productionReady: boolean };

// dash-card 系；共享色由 Design Tokens 派生（单一来源，P4-T2）
import { COLORS } from "@/lib/design-tokens";
const C = {
  bg: "#FAFAFA", card: COLORS.card, line: "#ECECEC", cardSub: "#F7F7F9",
  ink: COLORS.text, sub: COLORS.textSecondary, faint: COLORS.textMuted,
  blue: COLORS.primary, green: COLORS.success, amber: COLORS.warning, red: COLORS.danger, purple: "#5856D6",
};
const roleHex = (r: string) => r === "current" ? C.green : r === "baseline" ? C.blue : C.faint;
const roleKey = (r: string) => r === "current" ? "rp.ver.role.current" : r === "baseline" ? "rp.ver.role.baseline" : "rp.ver.role.history";
const num = (v: number | null | undefined, d = 1) => v == null ? "—" : v.toFixed(d);

function Pill({ label, color }: { label: string; color: string }) {
  return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color, background: `${color}14` }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{label}</span>;
}
function Seg<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string }[]; active: T; onChange: (k: T) => void }) {
  return (
    <div className="inline-flex p-1 rounded-full mb-5" style={{ background: "#F0F0F3", border: `1px solid ${C.line}` }}>
      {tabs.map((tb) => {
        const on = tb.key === active;
        return <button key={tb.key} onClick={() => onChange(tb.key)} className="px-4 h-8 rounded-full text-[13px] font-semibold transition-all" style={on ? { background: "#fff", color: C.ink, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" } : { color: C.sub }}>{tb.label}</button>;
      })}
    </div>
  );
}

export default function VersionCenterPage() {
  const { t } = useI18n();
  const tx = t as (k: string) => string;
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"versions" | "timeline" | "compare" | "integrity">("versions");
  const [now, setNow] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [vRes, tRes] = await Promise.all([fetch("/api/admin/versions"), fetch("/api/admin/version-timeline")]);
      const vData = await vRes.json(); const tData = await tRes.json();
      setVersions(vData.versions ?? []); setIntegrity(vData.integrity ?? null); setTimeline(tData.timeline ?? []); setError(null);
    } catch (e) { setError(String(e)); }
    setNow(new Date().toISOString().slice(11, 19) + " UTC");
  }, []);
  useEffect(() => { loadAll(); const id = setInterval(loadAll, 60_000); return () => clearInterval(id); }, [loadAll]);
  useEffect(() => {
    if (versions.length >= 2 && !compareA && !compareB) {
      const cur = versions.find((v) => v.role === "current"); const base = versions.find((v) => v.role === "baseline");
      if (cur) setCompareA(cur.id); if (base) setCompareB(base.id);
    }
  }, [versions, compareA, compareB]);
  const runCompare = useCallback(async () => {
    if (!compareA || !compareB) return;
    setComparing(true);
    try { const res = await fetch(`/api/admin/versions/compare?a=${encodeURIComponent(compareA)}&b=${encodeURIComponent(compareB)}`); setCompareResult(await res.json()); }
    finally { setComparing(false); }
  }, [compareA, compareB]);

  const cur = versions.find((v) => v.role === "current") ?? versions[0] ?? null;

  const shell = (inner: React.ReactNode) => <div className="min-h-screen dash-font" style={{ background: C.bg }}><div className="mx-auto max-w-[1600px] px-6 lg:px-10 py-8 dash-in">{inner}</div></div>;
  if (error) return shell(<div className="dash-card p-6 text-[14px]" style={{ color: C.red }}>{tx("common.load_error")}: {error}</div>);

  return shell(
    <>
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]" style={{ color: C.ink }}>{tx("rw.e.versions")}</h1>
          <p className="text-[13px] mt-1" style={{ color: C.faint }}>{tx("rp.ver.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/admin/mission-control" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-semibold dash-card dash-int" style={{ color: C.ink }}>← {tx("rp.ver.backSystem")}</Link>
          {now && <span className="text-[12px] tabular-nums hidden lg:inline" style={{ color: C.faint }}>{tx("common.refresh")} {now}</span>}
        </div>
      </header>

      {/* Integrity banner */}
      {integrity && integrity.status !== "OK" && (
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3 mb-6" style={{ background: `${integrity.status === "CRITICAL" ? C.red : C.amber}12`, border: `1px solid ${integrity.status === "CRITICAL" ? C.red : C.amber}33` }}>
          <span className="text-[15px]" style={{ color: integrity.status === "CRITICAL" ? C.red : C.amber }}>⚠</span>
          <span className="text-[13px] font-medium" style={{ color: integrity.status === "CRITICAL" ? C.red : C.amber }}>{tx("rp.learn.integrity")} {integrity.status === "CRITICAL" ? tx("rp.learn.st.crit") : tx("rp.learn.st.warn")} · DR {integrity.drCoveragePct}% · BP {integrity.bpCoveragePct}%</span>
        </div>
      )}

      {/* Current version hero */}
      {cur && (
        <div className="dash-card p-6 lg:p-7 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="lg:w-72 shrink-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.faint }}>{tx("rp.ver.current")}</div>
              <div className="text-[30px] font-semibold tabular-nums tracking-[-0.02em] mt-2" style={{ color: C.ink }}>{cur.id}</div>
              <div className="flex items-center gap-2 mt-3">
                <Pill label={cur.endDate ? tx("rp.ver.ended") : tx("rp.ver.running")} color={cur.endDate ? C.faint : C.green} />
                <Pill label="Production" color={C.blue} />
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
              {[
                [tx("rp.ver.scoreArch"), cur.scoreVersion, C.ink], ["Schema", cur.schemaVersion, C.ink], [tx("rp.ver.ruleEngine"), cur.ruleEngineVer, C.ink], [tx("rp.ver.llm"), cur.llmModelVer, C.ink],
                [tx("rp.ver.startDate"), cur.startDate?.slice(0, 10) ?? "—", C.sub], ["DR", cur.drLinked.toLocaleString(), C.sub], ["BP", cur.bpLinked.toLocaleString(), C.sub],
                [tx("rw.c.learning"), cur.learningReportExists ? tx("rp.ver.generated") : tx("common.no_data"), cur.learningReportExists ? C.green : C.faint],
              ].map(([k, v, c]) => (
                <div key={k as string}><div className="text-[11px]" style={{ color: C.faint }}>{k}</div><div className="text-[15px] font-semibold tabular-nums mt-1 truncate" style={{ color: c as string }}>{v}</div></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Version timeline (from version snapshots) */}
      {versions.length > 0 && (
        <section className="mb-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-3" style={{ color: C.faint }}>{tx("rp.ver.timeline")}</div>
          <div className="dash-card p-6">
            {[...versions].sort((a, b) => (a.startDate < b.startDate ? -1 : 1)).map((v, i, arr) => {
              const col = roleHex(v.role); const last = i === arr.length - 1;
              return (
                <div key={v.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ background: col, boxShadow: `0 0 0 3px ${col}22` }} />
                    {!last && <span className="w-px flex-1 my-1" style={{ background: C.line }} />}
                  </div>
                  <div className={`flex-1 flex items-center justify-between gap-3 flex-wrap ${last ? "" : "pb-5"}`}>
                    <div>
                      <span className="text-[14px] font-semibold tabular-nums" style={{ color: C.ink }}>{v.id}</span>
                      <span className="text-[12px] ml-2" style={{ color: C.faint }}>{v.scoreVersion} · {v.startDate?.slice(0, 10)}{v.endDate ? ` → ${v.endDate.slice(0, 10)}` : ` → ${tx("rp.ver.now")}`}</span>
                    </div>
                    <Pill label={tx(roleKey(v.role))} color={col} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Segmented tabs */}
      <Seg tabs={[{ key: "versions", label: tx("rp.ver.tabSnapshot") }, { key: "timeline", label: tx("rp.ver.timeline") }, { key: "compare", label: tx("rp.ver.tabCompare") }, { key: "integrity", label: tx("rp.learn.integrity") }]} active={tab} onChange={setTab} />

      {/* Versions table */}
      {tab === "versions" && (
        <div className="dash-card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr style={{ borderBottom: `1px solid ${C.line}` }}>
              {[tx("rp.freg.colStatus"), "ID", "Schema", "Model", tx("rp.v3s.colScore"), "LLM", tx("rp.ver.startDate"), tx("rp.ver.endDate"), "DR", "BP", tx("rp.ver.report")].map((h, i) => (
                <th key={h} className={`px-3 py-3 text-[11px] font-semibold uppercase whitespace-nowrap ${i <= 1 ? "text-left" : i >= 8 && i <= 9 ? "text-right" : "text-left"}`} style={{ color: C.faint }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="transition-colors hover:bg-[#F7F7F9]" style={{ borderBottom: `1px solid ${C.line}`, background: v.role === "current" ? `${C.green}08` : undefined }}>
                  <td className="px-3 py-3"><Pill label={tx(roleKey(v.role))} color={roleHex(v.role)} /></td>
                  <td className="px-3 py-3 font-semibold tabular-nums" style={{ color: C.ink }}>{v.id}</td>
                  <td className="px-3 py-3 tabular-nums" style={{ color: C.sub }}>{v.schemaVersion}</td>
                  <td className="px-3 py-3 tabular-nums" style={{ color: C.sub }}>{v.modelVersion}</td>
                  <td className="px-3 py-3 tabular-nums" style={{ color: C.sub }}>{v.scoreVersion}</td>
                  <td className="px-3 py-3 tabular-nums" style={{ color: C.sub }}>{v.llmModelVer}</td>
                  <td className="px-3 py-3 tabular-nums" style={{ color: C.faint }}>{v.startDate?.slice(0, 10)}</td>
                  <td className="px-3 py-3 tabular-nums" style={{ color: C.faint }}>{v.endDate?.slice(0, 10) ?? tx("rp.ver.running")}</td>
                  <td className="px-3 py-3 text-right tabular-nums" style={{ color: C.sub }}>{v.drLinked.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right tabular-nums" style={{ color: C.sub }}>{v.bpLinked.toLocaleString()}</td>
                  <td className="px-3 py-3"><span className="text-[12px]" style={{ color: v.learningReportExists ? C.green : C.faint }}>{v.learningReportExists ? "✓" : "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {versions.some((v) => v.changeLog) && (
            <div className="p-5 space-y-3" style={{ borderTop: `1px solid ${C.line}` }}>
              <div className="text-[11px] font-semibold uppercase" style={{ color: C.faint }}>{tx("rp.ver.changelog")}</div>
              {versions.filter((v) => v.changeLog).map((v) => (
                <div key={v.id} className="flex gap-3 text-[13px]"><span className="font-semibold tabular-nums shrink-0" style={{ color: C.blue }}>{v.id}</span><span style={{ color: C.sub }}>{v.changeLog}</span></div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Timeline (deployments / releases) */}
      {tab === "timeline" && (
        <div className="dash-card p-2">
          {timeline.length === 0 ? <div className="py-10 text-center text-[13px]" style={{ color: C.faint }}>{tx("common.no_data")}</div> : timeline.map((e, i) => {
            const meta = e.type === "DEPLOYMENT" ? { c: C.blue, tag: tx("rp.ver.tagDeploy"), title: e.summary, sub: `${e.commitHash} · ${e.buildStatus}` }
              : e.type === "VERSION" ? { c: roleHex((e as { role: string }).role), tag: tx("rp.ver.tagVersion"), title: e.id, sub: `${e.schemaVersion} · ${e.tradingDays}d` }
              : { c: C.purple, tag: tx("rp.ver.tagExp"), title: (e as { hypothesis: string }).hypothesis, sub: (e as { status: string }).status };
            return (
              <div key={`${e.type}-${i}`} className="flex items-start gap-3 px-4 py-3" style={i > 0 ? { borderTop: `1px solid ${C.line}` } : undefined}>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 mt-0.5" style={{ color: meta.c, background: `${meta.c}14` }}>{meta.tag}</span>
                <span className="text-[12px] tabular-nums shrink-0 mt-1 w-20" style={{ color: C.faint }}>{e.date}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: C.ink }}>{meta.title}</div>
                  <div className="text-[11px] tabular-nums mt-0.5" style={{ color: C.faint }}>{meta.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Compare */}
      {tab === "compare" && (
        <div className="dash-card p-6">
          <div className="flex flex-wrap items-end gap-3 mb-5">
            {[[`${tx("rp.ver.version")} A`, compareA, setCompareA], [`${tx("rp.ver.version")} B`, compareB, setCompareB]].map(([lbl, val, set]) => (
              <div key={lbl as string}>
                <div className="text-[11px] mb-1" style={{ color: C.faint }}>{lbl as string}</div>
                <select value={val as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} className="h-9 px-3 rounded-lg text-[13px] tabular-nums" style={{ background: C.cardSub, border: `1px solid ${C.line}`, color: C.ink }}>
                  <option value="">{tx("rp.ver.select")}</option>
                  {versions.map((v) => <option key={v.id} value={v.id}>{v.id} ({tx(roleKey(v.role))})</option>)}
                </select>
              </div>
            ))}
            <button onClick={runCompare} disabled={comparing || !compareA || !compareB} className="h-9 px-5 rounded-full text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: C.blue }}>{comparing ? tx("common.loading") : tx("rp.ver.runCompare")}</button>
          </div>
          {compareResult && (
            <div>
              {!compareResult.comparisonAllowed && <div className="text-[13px] mb-4 px-3 py-2 rounded-lg" style={{ background: `${C.amber}12`, color: C.amber }}>{compareResult.reason ?? tx("rp.ver.notComparable")}</div>}
              <div className="flex items-center gap-3 mb-4">
                <Pill label={`${tx("rp.learn.regDetect")} ${compareResult.regressionStatus}`} color={compareResult.regressionStatus === "OK" ? C.green : C.amber} />
                {compareResult.winRateDelta7d != null && <span className="text-[13px] tabular-nums" style={{ color: compareResult.winRateDelta7d >= 0 ? C.green : C.red }}>7d {tx("rp.afus.winRate")} Δ {compareResult.winRateDelta7d > 0 ? "+" : ""}{num(compareResult.winRateDelta7d)}%</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead><tr style={{ borderBottom: `1px solid ${C.line}` }}>{[tx("rp.learn.c.hz"), `A ${tx("rp.afus.winRate")}`, `B ${tx("rp.afus.winRate")}`, `Δ ${tx("rp.afus.winRate")}`, `Δ ${tx("rp.afus.cumRet")}`, "Δ Alpha"].map((h, i) => <th key={h} className={`px-3 py-2 text-[11px] font-semibold uppercase ${i === 0 ? "text-left" : "text-right"}`} style={{ color: C.faint }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {(compareResult.backtestDelta ?? []).map((d) => {
                      const a = compareResult.backtestA.find((x) => x.horizon === d.horizon); const b = compareResult.backtestB.find((x) => x.horizon === d.horizon);
                      return (
                        <tr key={d.horizon} style={{ borderBottom: `1px solid ${C.line}` }}>
                          <td className="px-3 py-2 font-semibold uppercase" style={{ color: C.ink }}>{d.horizon}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: C.sub }}>{a?.winRate != null ? `${num(a.winRate)}%` : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: C.sub }}>{b?.winRate != null ? `${num(b.winRate)}%` : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: d.winRateDelta == null ? C.faint : d.winRateDelta >= 0 ? C.green : C.red }}>{d.winRateDelta == null ? "—" : `${d.winRateDelta > 0 ? "+" : ""}${num(d.winRateDelta)}%`}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: d.returnDelta == null ? C.faint : d.returnDelta >= 0 ? C.green : C.red }}>{d.returnDelta == null ? "—" : `${d.returnDelta > 0 ? "+" : ""}${num(d.returnDelta, 2)}%`}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: d.alphaDelta == null ? C.faint : d.alphaDelta >= 0 ? C.green : C.red }}>{d.alphaDelta == null ? "—" : `${d.alphaDelta > 0 ? "+" : ""}${num(d.alphaDelta, 2)}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Integrity */}
      {tab === "integrity" && integrity && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[[tx("rp.ver.drLink"), integrity.drCoveragePct, integrity.drLinked, integrity.drTotal, integrity.drMissingCount],
            [tx("rp.ver.bpLink"), integrity.bpCoveragePct, integrity.bpLinked, integrity.bpTotal, integrity.bpMissingCount]].map(([lbl, pctv, linked, total, missing]) => (
            <div key={lbl as string} className="dash-card p-6">
              <div className="text-[13px] font-semibold" style={{ color: C.ink }}>{lbl}</div>
              <div className="text-[30px] font-semibold tabular-nums mt-2" style={{ color: (pctv as number) >= 100 ? C.green : C.amber }}>{pctv}%</div>
              <div className="text-[12px] tabular-nums mt-1" style={{ color: C.faint }}>{(linked as number).toLocaleString()} / {(total as number).toLocaleString()}</div>
              {(missing as number) > 0 && <div className="text-[12px] mt-2" style={{ color: C.amber }}>⚠ {(missing as number).toLocaleString()} {tx("rp.ver.unlinked")}</div>}
              <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "#EEEEF1" }}><div className="h-full rounded-full" style={{ width: `${pctv}%`, background: (pctv as number) >= 100 ? C.green : C.amber }} /></div>
            </div>
          ))}
          <div className="dash-card p-6 flex flex-col items-center justify-center text-center">
            <div className="text-[13px] font-semibold" style={{ color: C.ink }}>{tx("rp.ver.sysIntegrity")}</div>
            <div className="text-[22px] font-semibold mt-3" style={{ color: integrity.status === "OK" ? C.green : integrity.status === "CRITICAL" ? C.red : C.amber }}>{integrity.status}</div>
            <Pill label={integrity.status === "OK" ? tx("rp.ver.allLinked") : tx("rp.ver.needAttention")} color={integrity.status === "OK" ? C.green : C.amber} />
          </div>
        </div>
      )}
    </>
  );
}
