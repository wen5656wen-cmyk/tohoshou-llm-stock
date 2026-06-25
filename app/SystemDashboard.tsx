"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

type HealthStatus = {
  status: "PASS" | "WARNING" | "CRITICAL" | "NEVER_RUN" | "ERROR";
  criticalCount: number;
  warningCount: number;
  passCount: number;
  auditAt: string | null;
  topIssues: string[];
  allowRecommendation: boolean;
};

type Props = {
  activeStockCount: number;
  scoredCount: number;
  strongBuyCount: number;
  buyCount: number;
  totalBuyCount: number;
  validPriceCount: number;
  lastTradingDate: string | null;
  lastComputedAt: string | null;
  lastNewsSyncAt: string | null;
  lastPriceSyncAt: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelative(isoStr: string | null): string {
  if (!isoStr) return "—";
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const diffH = diffMs / 3600000;
  if (diffH < 1) return `${Math.round(diffH * 60)}分钟前`;
  if (diffH < 24) return `${Math.round(diffH)}小时前`;
  return `${Math.round(diffH / 24)}天前`;
}

function fmtTime(isoStr: string | null): string {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleString("zh-CN", {
    timeZone: "Asia/Tokyo",
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent, href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
  href?: string;
}) {
  const inner = (
    <div className={`bg-[#1a2035] rounded-xl border border-slate-700/40 px-4 py-3 flex flex-col gap-1 hover:border-slate-600/60 transition-colors ${href ? "cursor-pointer" : ""}`}>
      <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function HealthBadge({ h }: { h: HealthStatus | null }) {
  if (!h) return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-slate-600 animate-pulse" />
      <span className="text-xs text-slate-500">检查中...</span>
    </div>
  );

  const dot =
    h.status === "PASS" ? "bg-emerald-500" :
    h.status === "WARNING" ? "bg-yellow-500" :
    h.status === "CRITICAL" ? "bg-red-500 animate-pulse" :
    "bg-slate-500";

  const label =
    h.status === "PASS" ? "正常" :
    h.status === "WARNING" ? "警告" :
    h.status === "CRITICAL" ? "严重" :
    "未运行";

  const cls =
    h.status === "PASS" ? "text-emerald-400" :
    h.status === "WARNING" ? "text-yellow-400" :
    h.status === "CRITICAL" ? "text-red-400" :
    "text-slate-500";

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${dot}`} />
      <span className={`text-xs font-semibold ${cls}`}>{label}</span>
    </div>
  );
}

function SyncRow({ label, syncAt }: { label: string; syncAt: string | null }) {
  const age = syncAt ? (Date.now() - new Date(syncAt).getTime()) / 3600000 : null;
  const color = age == null ? "text-slate-500"
    : age < 12 ? "text-emerald-400"
    : age < 48 ? "text-yellow-400"
    : "text-red-400";

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-700/30 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="text-right">
        <span className={`text-xs font-medium tabular-nums ${color}`}>{fmtRelative(syncAt)}</span>
        {syncAt && <div className="text-[10px] text-slate-600">{fmtTime(syncAt)}</div>}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SystemDashboard({
  activeStockCount,
  scoredCount,
  strongBuyCount,
  buyCount,
  totalBuyCount,
  validPriceCount,
  lastTradingDate,
  lastComputedAt,
  lastNewsSyncAt,
  lastPriceSyncAt,
}: Props) {
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    fetch("/api/health/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setHealth(d))
      .catch(() => {});
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{t("nav.dashboard")}</h1>
        <p className="text-xs text-slate-500 mt-0.5">{t("home.system_overview_desc")}</p>
      </div>

      {/* ── Row 1: Core Metrics ──────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">{t("home.data_overview")}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label={t("home.db_stocks")}
            value={activeStockCount.toLocaleString()}
            sub="LISTED · 未退市"
            accent="text-white"
            href="/stocks"
          />
          <StatCard
            label={t("home.scored_count")}
            value={scoredCount.toLocaleString()}
            sub="adaptiveScore 有效"
            accent="text-blue-400"
            href="/screener"
          />
          <StatCard
            label={t("home.price_records")}
            value={validPriceCount.toLocaleString()}
            sub="close > 0"
            accent="text-slate-300"
          />
          <StatCard
            label={t("home.last_sync")}
            value={lastTradingDate ?? "—"}
            sub="最新行情日"
            accent="text-slate-300"
          />
        </div>
      </div>

      {/* ── Row 2: Today's Recommendations ──────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">{t("home.today_recs")}</div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="STRONG_BUY"
            value={strongBuyCount}
            sub={totalBuyCount === 0 ? "推荐未生成" : "强烈买入信号"}
            accent="text-emerald-400"
            href="/ai-picks?filter=STRONG_BUY"
          />
          <StatCard
            label="BUY"
            value={buyCount}
            sub="买入信号"
            accent="text-blue-400"
            href="/ai-picks?filter=BUY"
          />
          <StatCard
            label="TOTAL"
            value={totalBuyCount}
            sub={totalBuyCount === 0 ? "今日未生成" : "BUY + STRONG_BUY"}
            accent={totalBuyCount > 0 ? "text-white" : "text-slate-500"}
            href="/ai-picks"
          />
        </div>
      </div>

      {/* ── Row 3: Health + Sync Status ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Health */}
        <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white">{t("home.data_health")}</span>
            <HealthBadge h={health} />
          </div>
          {health ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-red-900/20 rounded-lg py-2 border border-red-800/30">
                  <div className="text-lg font-bold text-red-400">{health.criticalCount}</div>
                  <div className="text-[10px] text-slate-500">CRITICAL</div>
                </div>
                <div className="bg-yellow-900/20 rounded-lg py-2 border border-yellow-800/30">
                  <div className="text-lg font-bold text-yellow-400">{health.warningCount}</div>
                  <div className="text-[10px] text-slate-500">WARNING</div>
                </div>
                <div className="bg-emerald-900/20 rounded-lg py-2 border border-emerald-800/30">
                  <div className="text-lg font-bold text-emerald-400">{health.passCount}</div>
                  <div className="text-[10px] text-slate-500">PASS</div>
                </div>
              </div>
              {health.topIssues.length > 0 && (
                <div className="mt-2 space-y-1">
                  {health.topIssues.map((issue, i) => (
                    <div key={i} className="text-[10px] text-slate-400 bg-slate-800/40 rounded px-2 py-1 truncate">
                      {issue}
                    </div>
                  ))}
                </div>
              )}
              {health.auditAt && (
                <div className="text-[10px] text-slate-600 text-right">
                  最后检查：{fmtTime(health.auditAt)}
                </div>
              )}
            </div>
          ) : (
            <div className="h-16 bg-slate-800/30 rounded-lg animate-pulse" />
          )}
        </div>

        {/* Sync Status */}
        <div className="bg-[#1a2035] rounded-xl border border-slate-700/40 p-4">
          <div className="text-sm font-semibold text-white mb-3">{t("home.sync_status")}</div>
          <div>
            <SyncRow label="AI 评分 (compute-scores)" syncAt={lastComputedAt} />
            <SyncRow label="日线价格 (jquants)" syncAt={lastPriceSyncAt} />
            <SyncRow label="新闻 (news)" syncAt={lastNewsSyncAt} />
          </div>
          <div className="mt-3 pt-3 border-t border-slate-700/30">
            <div className="text-[10px] text-slate-500 mb-1">数据来源</div>
            <div className="flex flex-wrap gap-1.5">
              {["J-Quants", "Yahoo Finance JP", "TDnet"].map((s) => (
                <span key={s} className="text-[10px] bg-slate-700/40 text-slate-400 rounded px-1.5 py-0.5 border border-slate-700/50">{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Links ──────────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">{t("home.quick_links")}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "AI选股", href: "/ai-picks", desc: "推荐排行" },
            { label: "AI组合", href: "/portfolio", desc: "快照 + 模拟账户" },
            { label: "行业分析", href: "/sectors", desc: "板块热度" },
            { label: "数据同步", href: "/sync", desc: "同步管理" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-2.5 hover:bg-slate-700/40 hover:border-slate-600/60 transition-colors"
            >
              <div className="text-sm font-semibold text-white">{l.label}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{l.desc}</div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
