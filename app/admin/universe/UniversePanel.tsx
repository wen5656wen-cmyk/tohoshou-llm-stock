"use client";

// ── AI Universe 管理（P21-T2 · MOVE 承接页）─────────────────────────────────
//
// 来源：原 /stocks 页面（零入链孤儿，已下线）中**唯一不可替代的能力** ——
//   展示被排除出 AI 股票池的个股及其 excludeReason / aiExcludeSource。
//   /stocks 的其余内容（Top500 技术指标浏览）与 screener:indicators 同 API 重复，
//   且「财报数」列因 /api/indicators 硬编码 finCount:0 恒为 0，一并下线。
//
// ⚠️ 内部页：**不进任何主导航**（nav-config 无节点），仅工程/运维手输 URL 访问。
//   受 /api/admin/* 与 middleware 保护，未授权无法读取数据。

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/types";
import { getPrimaryName, getSecondaryName } from "@/lib/company-name";

type Row = {
  symbol: string; name: string; nameZh: string | null; nameEn: string | null;
  sector: string | null; market: string | null;
  aiEnabled: boolean; excludeReason: string | null; aiExcludeSource: string | null;
  isWatchlist?: boolean;
};

export default function UniverseAdminPage() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/indicators", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setRows(d.stocks ?? d.rows ?? []))
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  const excluded = (rows ?? []).filter((r) => !r.aiEnabled);
  const filtered = q
    ? excluded.filter((r) => `${r.symbol}${r.name}${r.nameZh ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    : excluded;

  return (
    <div className="min-h-screen px-4 sm:px-6 py-6" style={{ background: "#F5F5F7" }}>
      <div className="max-w-[1100px] mx-auto">
        <h1 className="text-[15px] font-semibold mb-1" style={{ color: "#1d1d1f" }}>
          {t("universe.filter.excluded")}
        </h1>
        <p className="text-[12px] mb-4" style={{ color: "#6e6e73" }}>
          {rows ? `${excluded.length} / ${rows.length}` : "—"}
        </p>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("common.search")}
          className="w-full max-w-xs h-9 px-3 mb-4 rounded-lg text-[13px] outline-none"
          style={{ border: "1px solid #d2d2d7", background: "#fff" }}
        />

        {err ? (
          <p className="text-[13px]" style={{ color: "#d70015" }}>{t("common.load_error")}</p>
        ) : !rows ? (
          <p className="text-[13px]" style={{ color: "#6e6e73" }}>…</p>
        ) : filtered.length === 0 ? (
          <p className="text-[13px]" style={{ color: "#6e6e73" }}>{t("common.no_data")}</p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #e5e5ea" }}>
            {filtered.map((s, i) => (
              <div key={s.symbol} className="flex items-center gap-3 px-4 py-2.5 text-[12px]"
                style={{ borderTop: i ? "1px solid #f2f2f7" : undefined }}>
                <Link href={`/stocks/${encodeURIComponent(s.symbol)}`} className="font-mono shrink-0 hover:underline" style={{ color: "#007AFF", width: 78 }}>
                  {s.symbol}
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="truncate" style={{ color: "#1d1d1f" }}>
                    {s.isWatchlist && <span className="mr-0.5" style={{ color: "#f59e0b" }} title={t("universe.rule.MANUAL_INCLUDE_WATCHLIST")}>★</span>}
                    {getPrimaryName(s, lang)}
                  </div>
                  {getSecondaryName(s, lang) && (
                    <div className="truncate text-[11px]" style={{ color: "#94a3b8" }}>{getSecondaryName(s, lang)}</div>
                  )}
                </div>
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#fef3c7", color: "#b45309" }}>
                  {t(`universe.reason.${s.excludeReason ?? "OTHER"}` as MessageKey)}
                </span>
                {s.aiExcludeSource && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#f1f5f9", color: "#64748b" }}>
                    {t(`universe.source.${s.aiExcludeSource}` as MessageKey)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
