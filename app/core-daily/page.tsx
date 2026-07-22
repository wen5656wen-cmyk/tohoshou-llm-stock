"use client";
// P26 Phase 5 · Core Daily —— Admin Shadow Dashboard v1（/core-daily）。
// **仅消费 Phase 4 只读 API**（/api/admin/core-daily/*）。不直连 DB、不调 Runtime/Python、不重算。
// 数据经 guardAdminRoute 门控（非 Admin → 401 → adminOnly 状态）。60s 自动刷新 + 手动刷新。
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

// ── API 响应类型（对齐 lib/core-daily/read.ts 输出）─────────────────────────────
interface StrategyHeader { strategyId: string; strategyVersion: string; researchStatus: string; validationStatus: string; }
interface RunShape {
  runId: string; strategyVersion: string; tradeDate: string; asOf: string; marketSession: string;
  runStatus: string; integrityStatus: string; integrityReasons: unknown; gateResult: string; gateBreadth: number | null;
  gateReasons: unknown; candidateCount: number; shadowBuyCount: number; dataVersion: string | null; failureReason: string | null;
  durationMs: number | null; startedAt: string | null; finishedAt: string | null;
}
interface SignalShape {
  symbol: string; inCandidatePool: boolean; asOfChangePct: number | null; decision: string; confidence: number | null;
  refClose: number | null; entryLow: number | null; entryHigh: number | null; topRules: unknown; failureReason: string | null;
}
interface ValidationShape {
  symbol: string; refClose: number | null; nextOpen: number | null; grossPct: number | null; netPct: number | null;
  slippagePct: number | null; fillState: string; success: boolean | null; failureReason: string | null;
}
interface LatestResp {
  status: string; tradeDate: string | null; currentStrategy: StrategyHeader; run: RunShape | null;
  signals: SignalShape[]; validation: ValidationShape[] | null; dataStatus: { code: string; missingFields: unknown };
}
interface RunDetailResp { run: RunShape; signals: SignalShape[]; validations: ValidationShape[]; }
interface StatsResp {
  status: string; source: string; historyStatus: string; sampleCount?: number; grossWinRate?: number | null; netWinRate?: number | null;
  averageGrossReturn?: number | null; averageNetReturn?: number | null; cumulativeGrossReturn?: number | null; cumulativeNetReturn?: number | null;
  averageSlippage?: number | null; validationStatus?: string; strategyVersion?: string;
}
interface RunsResp { items: (RunShape & { id: number })[]; hasMore: boolean; nextCursor: number | null; }
interface SignalsResp { items: (SignalShape & { id: number; tradeDate: string })[]; hasMore: boolean; nextCursor: number | null; }
interface ValidationsResp { items: (ValidationShape & { id: number; tradeDate: string })[]; hasMore: boolean; nextCursor: number | null; }

const API = "/api/admin/core-daily";
class Unauthorized extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include", cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new Unauthorized();
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return (await res.json()) as T;
}

// ── 机器码着色（状态语言中立，不入 i18n）─────────────────────────────────────
function pillClass(code: string): string {
  const green = ["OK", "PASS", "SHADOW_BUY", "PRODUCTION", "AVAILABLE", "HISTORY"];
  const red = ["ERROR", "BLOCKED", "RUN_FAILED", "AVOID", "FAILED", "NET_NOT_VALIDATED"];
  const amber = ["DATA_INSUFFICIENT", "NO_SIGNAL", "UNKNOWN", "NO_DATA", "DB_AGGREGATE", "NOT_AVAILABLE", "RESEARCH", "SHADOW", "NO_RUN"];
  if (green.includes(code)) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (red.includes(code)) return "bg-red-100 text-red-700 border-red-200";
  if (amber.includes(code)) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}
function Pill({ code }: { code: string | null | undefined }) {
  const c = code ?? "—";
  return <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border font-mono ${pillClass(c)}`}>{c}</span>;
}
function asList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}
function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(3)}%`;
}
function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
      <h2 className="text-[13px] font-bold text-slate-500 mb-3">{n}. {title}</h2>
      {children}
    </section>
  );
}
function Empty({ label }: { label: string }) {
  return <div className="text-[12px] text-slate-400 py-4 text-center">{label}</div>;
}

export default function CoreDailyPage() {
  const { t } = useI18n();
  const [latest, setLatest] = useState<LatestResp | null>(null);
  const [detail, setDetail] = useState<RunDetailResp | null>(null);
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [runs, setRuns] = useState<RunsResp | null>(null);
  const [signals, setSignals] = useState<SignalsResp | null>(null);
  const [vals, setVals] = useState<ValidationsResp | null>(null);
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"none" | "error" | "unauthorized">("none");
  const [updated, setUpdated] = useState<string>("");
  const [cursors, setCursors] = useState<number[]>([]);

  const load = useCallback(async (histDate?: string, cursor?: number | null) => {
    try {
      setError("none");
      const lt = await getJson<LatestResp>(`${API}/latest`);
      setLatest(lt);
      const useDate = histDate ?? (date || lt.tradeDate || "");
      if (!date && lt.tradeDate) setDate(lt.tradeDate);
      const [dt, st, rn, sg, vl] = await Promise.all([
        lt.run ? getJson<RunDetailResp>(`${API}/run/${encodeURIComponent(lt.run.runId)}`) : Promise.resolve(null),
        getJson<StatsResp>(`${API}/statistics`),
        getJson<RunsResp>(`${API}/runs?limit=20${cursor ? `&cursor=${cursor}` : ""}`),
        useDate ? getJson<SignalsResp>(`${API}/signals?tradeDate=${useDate}&limit=100`) : Promise.resolve(null),
        useDate ? getJson<ValidationsResp>(`${API}/validations?tradeDate=${useDate}&limit=100`) : Promise.resolve(null),
      ]);
      setDetail(dt); setStats(st); setRuns(rn); setSignals(sg); setVals(vl);
      setUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Unauthorized ? "unauthorized" : "error");
    } finally {
      setLoading(false);
    }
  }, [date]);

  // 挂载即拉取（异步 load 在 await 后 setState，属正常数据获取；对该 lint 规则精确豁免）
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // ── 四状态：Loading / Error / Unauthorized / Ready ─────────────────────────
  if (loading && !latest) {
    return (
      <div className="p-4 md:p-6 max-w-6xl space-y-3">
        <div className="h-10 w-64 bg-slate-100 rounded animate-pulse" />
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }
  if (error === "unauthorized") {
    return <div className="p-6 max-w-6xl"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-700 text-sm font-semibold">{t("cd.adminOnly")}</div></div>;
  }
  if (error === "error" || !latest) {
    return (
      <div className="p-6 max-w-6xl">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <div className="text-red-700 text-sm font-semibold mb-3">{t("cd.error")}</div>
          <button onClick={() => { setLoading(true); void load(); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white">{t("cd.retry")}</button>
        </div>
      </div>
    );
  }

  const cs = latest.currentStrategy;
  const run = latest.run;
  const candidates = detail?.signals.filter((s) => s.inCandidatePool) ?? [];

  return (
    <div className="p-4 md:p-6 max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[28px] font-bold text-slate-900 leading-tight">{t("cd.title")}</h1>
            <Pill code="SHADOW" /><Pill code="RESEARCH" />
          </div>
          <p className="text-sm text-slate-500 mt-1">{t("cd.subtitle")}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] text-slate-600">
            <span>{t("cd.h.currentStrategy")}: <b>{cs.strategyId}</b></span>
            <span>{t("cd.h.version")}: {cs.strategyVersion}</span>
            <span>{t("cd.h.research")}: <Pill code={cs.researchStatus} /></span>
            <span>{t("cd.h.validation")}: <Pill code={cs.validationStatus} /></span>
            <span>{t("cd.h.lastUpdated")}: {updated}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">{t("cd.autoRefresh")}</span>
          <button onClick={() => { void load(); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white">{t("cd.refresh")}</button>
        </div>
      </div>

      {/* Disclaimer 固定顶部 */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700 flex flex-wrap gap-x-3">
        <span>{t("cd.d.shadowOnly")}</span><span>{t("cd.d.researchOnly")}</span><span>{t("cd.d.notAdvice")}</span>
      </div>

      {/* S1 今日运行 */}
      <Section n={1} title={t("cd.s1")}>
        {run ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <div>{t("cd.f.tradeDate")}<div className="font-mono font-semibold">{run.tradeDate}</div></div>
            <div>{t("cd.f.runStatus")}<div><Pill code={run.runStatus} /></div></div>
            <div>{t("cd.f.session")}<div className="font-mono">{run.marketSession} · {run.asOf}</div></div>
            <div>{t("cd.f.duration")}<div className="font-mono">{run.durationMs ?? "—"}ms</div></div>
            <div>{t("cd.f.start")}<div className="font-mono text-[10px]">{run.startedAt ?? "—"}</div></div>
            <div>{t("cd.f.finish")}<div className="font-mono text-[10px]">{run.finishedAt ?? "—"}</div></div>
          </div>
        ) : <Empty label={t("cd.empty")} />}
      </Section>

      {/* S2 大盘门控 */}
      <Section n={2} title={t("cd.s2")}>
        {run ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-[12px]">
              <span>Breadth: <Pill code={run.gateResult} /> <span className="font-mono">{run.gateBreadth ?? "—"}</span></span>
              <span>StrategyReady: <Pill code={run.integrityStatus} /></span>
            </div>
            <div className="flex flex-wrap gap-2">
              {["TOPIX", "VWAP", "Liquidity", "Event", "MarketRisk"].map((k) => (
                <span key={k} className="text-[11px]">{k}: <Pill code="UNKNOWN" /></span>
              ))}
            </div>
            <div className="text-[10px] text-slate-400">{t("cd.gate.na")}</div>
            {asList(run.gateReasons).length > 0 && (
              <div className="text-[11px] text-red-600">{t("cd.f.reasons")}: {asList(run.gateReasons).join(", ")}</div>
            )}
            {asList(latest.dataStatus.missingFields).length > 0 && (
              <div className="text-[11px] text-amber-600">DATA: {asList(latest.dataStatus.missingFields).join(", ")}</div>
            )}
          </div>
        ) : <Empty label={t("cd.empty")} />}
      </Section>

      {/* S3 候选池（含淘汰） */}
      <Section n={3} title={`${t("cd.s3")} (${candidates.length})`}>
        {candidates.length ? (
          <div className="overflow-x-auto"><table className="w-full text-[12px]">
            <thead><tr className="text-slate-400 text-left"><th>{t("cd.f.symbol")}</th><th>{t("cd.f.confidence")}</th><th>{t("cd.f.decision")}</th><th>{t("cd.f.reason")}</th></tr></thead>
            <tbody>{candidates.map((s) => (
              <tr key={s.symbol} className="border-t border-slate-100">
                <td className="font-mono">{s.symbol}</td>
                <td className="font-mono">{s.confidence ?? "—"}</td>
                <td><Pill code={s.decision} /> <span className="text-[10px] text-slate-400">{s.decision === "SHADOW_BUY" ? t("cd.f.kept") : t("cd.f.eliminated")}</span> {s.failureReason && <Pill code={s.failureReason} />}</td>
                <td className="text-[10px] text-slate-500 max-w-xs truncate">{asList(s.topRules).slice(0, 2).join(" / ")}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty label={t("cd.empty")} />}
      </Section>

      {/* S4 最终决策 */}
      <Section n={4} title={t("cd.s4")}>
        <div className="mb-3 text-[11px] font-bold text-amber-700 flex gap-3"><span>{t("cd.d.shadowOnly")}</span><span>{t("cd.d.notAdvice")}</span></div>
        <div className="text-lg font-bold mb-2"><Pill code={latest.status} /></div>
        {latest.status === "SHADOW_BUY" && latest.signals.length ? (
          <div className="overflow-x-auto"><table className="w-full text-[12px]">
            <thead><tr className="text-slate-400 text-left"><th>{t("cd.f.symbol")}</th><th>{t("cd.f.entry")}</th><th>{t("cd.f.confidence")}</th><th>{t("cd.h.version")}</th><th>{t("cd.h.validation")}</th></tr></thead>
            <tbody>{latest.signals.map((s) => (
              <tr key={s.symbol} className="border-t border-slate-100">
                <td className="font-mono">{s.symbol}</td>
                <td className="font-mono">{s.entryLow}~{s.entryHigh}</td>
                <td className="font-mono">{s.confidence ?? "—"}</td>
                <td>{cs.strategyVersion}</td>
                <td><Pill code={cs.validationStatus} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty label={t("cd.empty")} />}
      </Section>

      {/* S5 次日验证（可选日期，含失败） */}
      <Section n={5} title={t("cd.s5")}>
        <div className="mb-2"><input type="date" value={date} onChange={(e) => { setDate(e.target.value); void load(e.target.value); }} className="text-[12px] border border-slate-200 rounded px-2 py-1" /></div>
        {vals && vals.items.length ? (
          <div className="overflow-x-auto"><table className="w-full text-[12px]">
            <thead><tr className="text-slate-400 text-left"><th>{t("cd.f.symbol")}</th><th>{t("cd.f.open")}</th><th>{t("cd.f.gross")}</th><th>{t("cd.f.net")}</th><th>{t("cd.f.slippage")}</th><th>{t("cd.f.fill")}</th><th>{t("cd.f.success")}</th><th>{t("cd.f.reasons")}</th></tr></thead>
            <tbody>{vals.items.map((v) => (
              <tr key={v.symbol} className="border-t border-slate-100">
                <td className="font-mono">{v.symbol}</td><td className="font-mono">{v.nextOpen ?? "—"}</td>
                <td className="font-mono">{pct(v.grossPct)}</td><td className={`font-mono font-semibold ${(v.netPct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{pct(v.netPct)}</td>
                <td className="font-mono">{v.slippagePct ?? "—"}</td><td><Pill code={v.fillState} /></td>
                <td>{v.success ? "✓" : "✗"}</td><td>{v.failureReason && <Pill code={v.failureReason} />}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty label={t("cd.awaiting")} />}
      </Section>

      {/* S6 统计 */}
      <Section n={6} title={t("cd.s6")}>
        {stats && stats.status !== "NO_DATA" ? (
          <div className="space-y-2">
            <div className="text-[12px]">{t("cd.f.source")}: <Pill code={stats.source} /> · {t("cd.h.validation")}: <Pill code={stats.validationStatus} /></div>
            {stats.source === "DB_AGGREGATE" && <div className="text-[11px] font-semibold text-amber-600">⚠ {t("cd.stat.histNA")}</div>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
              <div>{t("cd.f.sample")}<div className="font-mono font-bold">{stats.sampleCount ?? "—"}</div></div>
              <div>{t("cd.f.grossWin")}<div className="font-mono">{stats.grossWinRate ?? "—"}</div></div>
              <div>{t("cd.f.netWin")}<div className="font-mono">{stats.netWinRate ?? "—"}</div></div>
              <div>{t("cd.f.avgSlippage")}<div className="font-mono">{stats.averageSlippage ?? "—"}</div></div>
              <div>{t("cd.f.grossAvg")}<div className="font-mono">{pct(stats.averageGrossReturn)}</div></div>
              <div>{t("cd.f.netAvg")}<div className={`font-mono font-semibold ${(stats.averageNetReturn ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{pct(stats.averageNetReturn)}</div></div>
              <div>{t("cd.f.grossCum")}<div className="font-mono">{pct(stats.cumulativeGrossReturn)}</div></div>
              <div>{t("cd.f.netCum")}<div className="font-mono">{pct(stats.cumulativeNetReturn)}</div></div>
            </div>
          </div>
        ) : <Empty label={t("cd.empty")} />}
      </Section>

      {/* S7 运行历史（cursor 分页） */}
      <Section n={7} title={t("cd.s7")}>
        {runs && runs.items.length ? (
          <>
            <div className="overflow-x-auto"><table className="w-full text-[12px]">
              <thead><tr className="text-slate-400 text-left"><th>{t("cd.f.tradeDate")}</th><th>asOf</th><th>{t("cd.f.runStatus")}</th><th>{t("cd.f.gate")}</th><th>SHADOW_BUY</th><th>{t("cd.f.duration")}</th></tr></thead>
              <tbody>{runs.items.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="font-mono">{r.tradeDate}</td><td className="font-mono">{r.asOf}</td><td><Pill code={r.runStatus} /></td>
                  <td><Pill code={r.gateResult} /></td><td className="font-mono">{r.shadowBuyCount}</td><td className="font-mono">{r.durationMs ?? "—"}ms</td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="flex gap-2 mt-2">
              <button disabled={!cursors.length} onClick={() => { const prev = cursors.slice(0, -1); setCursors(prev); void load(undefined, prev[prev.length - 1] ?? null); }} className="text-[11px] px-2 py-1 rounded border border-slate-200 disabled:opacity-40">{t("cd.prev")}</button>
              <button disabled={!runs.hasMore} onClick={() => { if (runs.nextCursor) { setCursors((c) => [...c, runs.nextCursor as number]); void load(undefined, runs.nextCursor); } }} className="text-[11px] px-2 py-1 rounded border border-slate-200 disabled:opacity-40">{t("cd.next")}</button>
            </div>
          </>
        ) : <Empty label={t("cd.empty")} />}
      </Section>

      {/* S8 信号历史 */}
      <Section n={8} title={t("cd.s8")}>
        {signals && signals.items.length ? (
          <div className="overflow-x-auto"><table className="w-full text-[12px]">
            <thead><tr className="text-slate-400 text-left"><th>{t("cd.f.symbol")}</th><th>asOf</th><th>{t("cd.f.decision")}</th><th>{t("cd.f.confidence")}</th><th>{t("cd.f.reasons")}</th></tr></thead>
            <tbody>{signals.items.slice(0, 50).map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="font-mono">{s.symbol}</td><td className="font-mono">{(s as SignalShape & { asOf?: string }).asOf ?? "—"}</td>
                <td><Pill code={s.decision} /></td><td className="font-mono">{s.confidence ?? "—"}</td>
                <td>{s.failureReason && <Pill code={s.failureReason} />}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty label={t("cd.empty")} />}
      </Section>

      {/* S9 免责 */}
      <Section n={9} title={t("cd.s9")}>
        <ul className="text-[12px] text-slate-600 space-y-1 list-disc pl-5">
          <li>{t("cd.d.shadowOnly")}</li><li>{t("cd.d.researchOnly")}</li><li>{t("cd.d.noExec")}</li><li>{t("cd.d.notAdvice")}</li><li>{t("cd.d.mayChange")}</li>
        </ul>
      </Section>
    </div>
  );
}
