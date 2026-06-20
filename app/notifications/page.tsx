"use client";

import { useEffect, useState, useCallback } from "react";

type NotificationLog = {
  id: number;
  type: string;
  title: string;
  content: string;
  symbols: string[];
  status: string;
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type Settings = {
  enabled: boolean;
  morningReportEnabled: boolean;
  middayReportEnabled: boolean;
  closeReportEnabled: boolean;
  realtimeAlertEnabled: boolean;
  portfolioAlertEnabled: boolean;
  minScoreChange: number;
  minPriceChangePct: number;
  minVolumeRatio: number;
};

type Quota = {
  type: string;
  planLabel: string;
  value: number | null;
  totalUsage: number;
  remaining: number | null;
  pct: number;
  exhausted: boolean;
  error?: string;
};

const TYPE_LABELS: Record<string, string> = {
  MORNING_REPORT: "📈 朝報",
  MIDDAY_REPORT: "⚡ 午間速報",
  CLOSE_REPORT: "🔔 大引けまとめ",
  REALTIME_ALERT: "🚨 異動アラート",
  NEWS_ALERT: "📰 ニュースアラート",
  PORTFOLIO_ALERT: "📦 持仓アラート",
  TEST: "✅ テスト送信",
};

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: "text-green-400",
  FAILED: "text-red-400",
  PENDING: "text-yellow-400",
  QUOTA_EXCEEDED: "text-orange-400",
};

export default function NotificationsPage() {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [logsRes, settingsRes, quotaRes] = await Promise.all([
      fetch("/api/notifications/logs?limit=30").then((r) => r.json()),
      fetch("/api/notifications/settings").then((r) => r.json()),
      fetch("/api/notifications/quota").then((r) => r.json()).catch(() => null),
    ]);
    setLogs(logsRes.logs ?? []);
    setSettings(settingsRes);
    setQuota(quotaRes);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function doSend(action: string, label: string) {
    setSending(action);
    setMsg(null);
    try {
      let res;
      if (action === "test") {
        res = await fetch("/api/line/test-flex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "test" }) });
      } else if (action === "test-morning") {
        res = await fetch("/api/line/test-flex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "morning" }) });
      } else if (action === "morning") {
        res = await fetch("/api/notifications/send-morning-report", { method: "POST" });
      } else if (action === "close") {
        res = await fetch("/api/notifications/send-close-report", { method: "POST" });
      } else if (action === "alerts") {
        res = await fetch("/api/notifications/check-alerts", { method: "POST" });
      } else {
        throw new Error("Unknown action");
      }
      const data = await res.json();
      if (data.quotaExceeded) {
        setMsg(`⚠️ LINE 月額度已耗尽 (429) — 下月1日リセット。送信をスキップしました。`);
        setTimeout(loadData, 1000); // refresh logs to show QUOTA_EXCEEDED entry
      } else if (data.error) {
        setMsg(`❌ ${label} 失敗: ${data.error}`);
      } else {
        setMsg(`✅ ${label} 送信成功`);
        setTimeout(loadData, 1000);
      }
    } catch (e) {
      setMsg(`❌ ${label} エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(null);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    await fetch("/api/notifications/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setMsg("✅ 設定保存完了");
  }

  if (loading) {
    return <div className="text-slate-400 text-center py-20">読み込み中...</div>;
  }

  const testBtns = [
    { action: "test", label: "テスト Flex 送信" },
    { action: "test-morning", label: "朝報テスト" },
    { action: "morning", label: "朝報を今すぐ送信" },
    { action: "close", label: "大引けまとめを今すぐ送信" },
    { action: "alerts", label: "アラートチェック実行" },
  ];

  const quotaExhausted = quota?.exhausted === true;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">🔔 通知管理</h1>
        <p className="text-slate-400 text-sm mt-1">LINE Flex Message 設定・テスト・ログ</p>
      </div>

      {/* LINE 配額パネル */}
      {quota && !quota.error && (
        <div className={`rounded-xl p-5 border ${quotaExhausted ? "bg-red-900/30 border-red-700/60" : "bg-slate-800/60 border-slate-700/50"}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white">📊 LINE 配額状況</h2>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${quotaExhausted ? "bg-red-700/50 text-red-300" : "bg-slate-700 text-slate-300"}`}>
              {quota.planLabel}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">月間割当</p>
              <p className="text-lg font-bold text-white">{quota.value !== null ? `${quota.value.toLocaleString()} 通` : "無制限"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">使用済み</p>
              <p className={`text-lg font-bold ${quotaExhausted ? "text-red-400" : "text-white"}`}>{quota.totalUsage.toLocaleString()} 通</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">残り</p>
              <p className={`text-lg font-bold ${quotaExhausted ? "text-red-400" : "text-green-400"}`}>
                {quota.remaining !== null ? `${quota.remaining.toLocaleString()} 通` : "∞"}
              </p>
            </div>
          </div>
          {quota.value !== null && (
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${quotaExhausted ? "bg-red-500" : quota.pct >= 80 ? "bg-yellow-500" : "bg-blue-500"}`}
                style={{ width: `${quota.pct}%` }}
              />
            </div>
          )}
          {quota.value !== null && (
            <p className="text-xs text-slate-400 mt-1.5 text-right">{quota.pct}% 使用済み</p>
          )}
        </div>
      )}

      {/* 配額耗尽警告 */}
      {quotaExhausted && (
        <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-900/40 text-red-300 border border-red-700/50">
          ⚠️ LINE 月額度已耗尽 — 本月 (200/200) の無料枠を使い切りました。来月1日にリセットされます。送信ボタンは無効化されています。
        </div>
      )}

      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${msg.startsWith("✅") ? "bg-green-900/40 text-green-300 border border-green-700/50" : msg.startsWith("⚠️") ? "bg-orange-900/40 text-orange-300 border border-orange-700/50" : "bg-red-900/40 text-red-300 border border-red-700/50"}`}>
          {msg}
        </div>
      )}

      {/* テストボタン */}
      <div className="bg-slate-800/60 rounded-xl p-6 border border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">テスト送信</h2>
          {quotaExhausted && (
            <span className="text-xs text-red-400 bg-red-900/30 px-2 py-1 rounded border border-red-700/40">月額度耗尽・送信不可</span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {testBtns.map(({ action, label }) => (
            <button
              key={action}
              disabled={sending !== null || quotaExhausted}
              onClick={() => doSend(action, label)}
              title={quotaExhausted ? "LINE 月額度已耗尽，下月1日リセット" : undefined}
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                quotaExhausted
                  ? "bg-slate-700/40 text-slate-500 cursor-not-allowed opacity-50"
                  : sending === action
                  ? "bg-blue-700/50 text-blue-300 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {sending === action ? "送信中..." : quotaExhausted ? `${label} (無効)` : label}
            </button>
          ))}
        </div>
      </div>

      {/* 通知設定 */}
      {settings && (
        <div className="bg-slate-800/60 rounded-xl p-6 border border-slate-700/50">
          <h2 className="text-lg font-semibold text-white mb-4">通知設定</h2>
          <div className="space-y-3">
            {[
              ["enabled", "通知全体 ON/OFF"],
              ["morningReportEnabled", "朝報 (08:00 JST)"],
              ["middayReportEnabled", "午間速報 (12:30 JST)"],
              ["closeReportEnabled", "大引けまとめ (15:45 JST)"],
              ["realtimeAlertEnabled", "リアルタイムアラート (毎30分)"],
              ["portfolioAlertEnabled", "持仓アラート"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!settings[key as keyof Settings]}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
                  className="w-4 h-4 accent-blue-500"
                />
                <span className="text-slate-300 text-sm">{label}</span>
              </label>
            ))}

            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-700">
              {[
                ["minScoreChange", "AI評分変化閾値", "点"],
                ["minPriceChangePct", "価格変化閾値", "%"],
                ["minVolumeRatio", "出来高倍率閾値", "x"],
              ].map(([key, label, unit]) => (
                <div key={key}>
                  <label className="block text-xs text-slate-400 mb-1">{label}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={settings[key as keyof Settings] as number}
                      onChange={(e) => setSettings({ ...settings, [key]: parseFloat(e.target.value) })}
                      className="w-full bg-slate-700 text-white rounded px-2 py-1 text-sm"
                      step={key === "minVolumeRatio" ? 0.5 : 1}
                      min={0}
                    />
                    <span className="text-slate-400 text-xs">{unit}</span>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={saveSettings}
              className="mt-2 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm font-medium transition-all"
            >
              設定を保存
            </button>
          </div>
        </div>
      )}

      {/* 送信ログ */}
      <div className="bg-slate-800/60 rounded-xl p-6 border border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">送信ログ（直近30件）</h2>
          <button onClick={loadData} className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-700">更新</button>
        </div>
        {logs.length === 0 ? (
          <p className="text-slate-500 text-sm">まだログがありません</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 py-2 border-b border-slate-700/50 last:border-0">
                <span className="text-xs text-slate-500 whitespace-nowrap mt-0.5">
                  {new Date(log.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-xs text-slate-400 whitespace-nowrap">{TYPE_LABELS[log.type] ?? log.type}</span>
                <span className="flex-1 text-sm text-slate-300 truncate">{log.title}</span>
                <span className={`text-xs font-medium whitespace-nowrap ${STATUS_COLOR[log.status] ?? "text-slate-400"}`}>
                  {log.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
