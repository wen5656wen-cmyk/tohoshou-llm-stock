"use client";

import { useEffect, useState, useCallback } from "react";

type Experiment = {
  id: string;
  versionSnapshotId: string | null;
  startDate: string;
  endDate: string | null;
  hypothesis: string;
  changes: Record<string, unknown> | string;
  targetMetric: string;
  targetThreshold: number | null;
  status: string;
  resultSummary: string | null;
  winRateDelta7d: number | null;
  winRateDelta30d: number | null;
  alphaDelta30d: number | null;
  decision: string | null;
  decisionReason: string | null;
  decisionDate: string | null;
  nextExperimentId: string | null;
  notes: string | null;
  createdAt: string;
};

type Summary = Record<string, number>;

const S = {
  bg:      "#0a0a0a",
  surface: "#111",
  border:  "#222",
  muted:   "#666",
  text:    "#ddd",
  green:   "#22c55e",
  yellow:  "#eab308",
  red:     "#ef4444",
  blue:    "#3b82f6",
  orange:  "#f97316",
  purple:  "#a855f7",
  teal:    "#14b8a6",
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  RUNNING:   { color: S.green,  label: "进行中"   },
  PLANNED:   { color: S.blue,   label: "计划中"   },
  COMPLETED: { color: S.teal,   label: "已完成" },
  ADOPTED:   { color: S.purple, label: "已采纳"   },
  ABANDONED: { color: S.muted,  label: "已废弃" },
};

const DECISION_CONFIG: Record<string, { color: string }> = {
  ADOPTED:  { color: S.green  },
  REJECTED: { color: S.red    },
  PENDING:  { color: S.yellow },
};

function statusBadge(status: string) {
  const cfg = STATUS_CONFIG[status] ?? { color: S.muted, label: status };
  return (
    <span style={{ background: cfg.color, color: "#000", fontWeight: 700, fontSize: 10, padding: "1px 5px", borderRadius: 3 }}>
      {cfg.label}
    </span>
  );
}

const DECISION_LABEL: Record<string, string> = {
  ADOPTED: "已采纳",
  REJECTED: "已拒绝",
  PENDING: "待定",
};

function decisionBadge(decision: string | null) {
  if (!decision) return <span style={{ color: S.muted }}>—</span>;
  const cfg = DECISION_CONFIG[decision] ?? { color: S.muted };
  return <span style={{ color: cfg.color, fontWeight: 700 }}>{DECISION_LABEL[decision] ?? decision}</span>;
}

function deltaCell(v: number | null, suffix = "pp") {
  if (v === null) return <span style={{ color: S.muted }}>—</span>;
  const color = v > 0 ? S.green : v < -5 ? S.red : v < 0 ? S.yellow : S.text;
  return <span style={{ color }}>{v >= 0 ? "+" : ""}{v.toFixed(2)}{suffix}</span>;
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [summary,     setSummary]     = useState<Summary>({});
  const [total,       setTotal]       = useState(0);
  const [error,       setError]       = useState<string | null>(null);
  const [now,         setNow]         = useState("");
  const [activeStatus, setActiveStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch("/api/admin/experiments");
      const data = await res.json();
      setExperiments(data.experiments ?? []);
      setSummary(data.summary ?? {});
      setTotal(data.total ?? 0);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
    setNow(new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC");
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const mono: React.CSSProperties = { fontFamily: "monospace", fontSize: 12 };
  const cell: React.CSSProperties = { padding: "6px 10px", borderBottom: `1px solid ${S.border}`, ...mono, verticalAlign: "top" };

  const filtered = activeStatus
    ? experiments.filter((e) => e.status === activeStatus)
    : experiments;

  return (
    <div style={{ background: S.bg, minHeight: "100vh", color: S.text, ...mono, padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>实验管理</h1>
          <div style={{ color: S.muted, fontSize: 11, marginTop: 2 }}>
            只读 · {total} 个实验 · 刷新于 {now}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/admin/versions" style={{ color: S.blue, fontSize: 11, textDecoration: "none" }}>
            版本中心 →
          </a>
          <a href="/admin/mission-control" style={{ color: S.blue, fontSize: 11, textDecoration: "none" }}>
            ← 控制中心
          </a>
        </div>
      </div>

      {error && (
        <div style={{ background: "#1a0000", border: `1px solid ${S.red}`, padding: 8, marginBottom: 12, color: S.red, fontSize: 12 }}>
          错误：{error}
        </div>
      )}

      {/* Status summary cards */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
          const count = summary[status] ?? 0;
          const isActive = activeStatus === status;
          return (
            <button
              key={status}
              onClick={() => setActiveStatus(isActive ? null : status)}
              style={{
                background: isActive ? `${cfg.color}22` : S.surface,
                border: `1px solid ${isActive ? cfg.color : S.border}`,
                color: cfg.color, padding: "10px 16px", cursor: "pointer",
                ...mono, borderRadius: 4, textAlign: "center", minWidth: 100,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700 }}>{count}</div>
              <div style={{ fontSize: 10 }}>{status}</div>
            </button>
          );
        })}
        {activeStatus && (
          <button
            onClick={() => setActiveStatus(null)}
            style={{ background: "transparent", border: `1px solid ${S.border}`, color: S.muted, padding: "10px 16px", cursor: "pointer", ...mono, borderRadius: 4 }}
          >
            显示全部
          </button>
        )}
      </div>

      {/* Empty state */}
      {experiments.length === 0 && (
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, padding: 32, textAlign: "center", color: S.muted }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🧪</div>
          <div style={{ fontSize: 14 }}>暂无实验记录。</div>
          <div style={{ fontSize: 11, marginTop: 8 }}>
            要注册实验，请通过 Prisma Studio 或 CLI 向 <code>experiment_registries</code> 插入一行。
            <br />
            始终在新版本下首次 cron 运行<strong>之前</strong>注册实验。
          </div>
        </div>
      )}

      {/* Experiment table */}
      {filtered.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${S.border}` }}>
          <thead>
            <tr style={{ background: "#181818", fontSize: 11, color: S.muted }}>
              {["状态","ID","版本快照","开始","结束","假设","目标指标","决定","7日Δ胜率","30日Δ胜率","Δ超额","决定日期","备注"].map((h) => (
                <th key={h} style={{ ...cell, textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((ex) => (
              <tr key={ex.id} style={{ background: ex.status === "RUNNING" ? "#0a1a0a" : "transparent" }}>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{statusBadge(ex.status)}</td>
                <td style={{ ...cell, color: S.blue, whiteSpace: "nowrap" }}>{ex.id}</td>
                <td style={{ ...cell, color: S.muted, whiteSpace: "nowrap" }}>{ex.versionSnapshotId ?? "—"}</td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{ex.startDate}</td>
                <td style={{ ...cell, color: S.muted, whiteSpace: "nowrap" }}>{ex.endDate ?? "进行中"}</td>
                <td style={{ ...cell, maxWidth: 240, fontSize: 11, color: S.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {ex.hypothesis}
                </td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  <span style={{ color: S.yellow }}>{ex.targetMetric}</span>
                  {ex.targetThreshold != null && <span style={{ color: S.muted }}> ≥{ex.targetThreshold}</span>}
                </td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{decisionBadge(ex.decision)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{deltaCell(ex.winRateDelta7d)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{deltaCell(ex.winRateDelta30d)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{deltaCell(ex.alphaDelta30d)}</td>
                <td style={{ ...cell, color: S.muted, whiteSpace: "nowrap" }}>{ex.decisionDate ?? "—"}</td>
                <td style={{ ...cell, maxWidth: 180, fontSize: 11, color: S.muted, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {ex.notes ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Usage note */}
      <div style={{ marginTop: 24, background: S.surface, border: `1px solid ${S.border}`, padding: 12, fontSize: 11, color: S.muted }}>
        <strong style={{ color: S.text }}>如何注册实验：</strong>
        <br />
        1. 修改模型逻辑前，先运行：<code style={{ background: "#222", padding: "0 4px" }}>npx prisma studio</code>
        <br />
        2. 在 <code>experiment_registries</code> 中插入一行，status=PLANNED 并填写假设。
        <br />
        3. 通过 <code>versionSnapshotId</code> 关联到当前 VersionSnapshot。
        <br />
        4. 实验结束后，更新 status + decision + 结果指标。
        <br />
        <br />
        <strong style={{ color: S.text }}>只读面板</strong> — UI 不支持编辑，所有实验变更通过 Prisma Studio 或数据库 CLI 操作。
      </div>

      <div style={{ marginTop: 16, fontSize: 10, color: S.muted, borderTop: `1px solid ${S.border}`, paddingTop: 8 }}>
        实验管理 · 每60秒自动刷新 · 只读
      </div>
    </div>
  );
}
