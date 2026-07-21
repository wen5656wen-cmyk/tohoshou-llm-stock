"use client";

// ── 系统工作区 Hub（P21-T5-4B · 系统工作区唯一入口）─────────────────────────
//
// IA 按**运维提问顺序**而非技术模块排列（T5-4A 已批准）：
//   ① 运行状态   今天跑了吗？跑到哪一步？哪里失败了？
//   ② 数据健康   产出的数据可不可信？有没有 CRITICAL？
//   ③ 系统维护   股票池、Mission 审计、版本部署对不对？
//   ④ 运维操作   需要我动手补数据 / 重跑吗？  ← **唯一含写操作的区域**
//
// 改造前是 6 个按技术模块排的 Tab（overview/runtime/health/verify/sync/deploy），
// 运维要回答「今天数据对不对」得在 health、verify、overview 三处来回跳。
//
// ⚠️ 写操作隔离（T5-4A §7）：④ 运维操作是唯一含触发按钮的区域，在 Tab 列表中
//    以分隔线 + ⚠ 标记与只读区切开。①②③ 绝不出现任何触发按钮。
//
// 子标签走 URL（?tab=X&sub=Y），沿用 Research 区已验证的方案（T3 建立）：
// 深链可分享、刷新不丢、跨面板跳转不 no-op。

import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n";
import { AppLoading, COLORS } from "@/components/ui";
import SystemBreadcrumb from "./SystemBreadcrumb";

const spin = () => <AppLoading />;
const MissionControlView = dynamic(() => import("./MissionControlView"), { ssr: false, loading: spin });
const RuntimeView = dynamic(() => import("./RuntimeView"), { ssr: false, loading: spin });
const HealthView = dynamic(() => import("./HealthView"), { ssr: false, loading: spin });
const VerifyView = dynamic(() => import("./VerifyView"), { ssr: false, loading: spin });
const SyncView = dynamic(() => import("./SyncView"), { ssr: false, loading: spin });
const DeployView = dynamic(() => import("./DeployView"), { ssr: false, loading: spin });
const UniverseView = dynamic(() => import("./UniverseView"), { ssr: false, loading: spin });
const MissionAuditView = dynamic(() => import("./MissionAuditView"), { ssr: false, loading: spin });

/** 四阶段。`write: true` 标记写操作区，UI 上以分隔线隔开；`audience` 为后续权限控制预留。 */
const TABS = [
  { key: "runtime", labelKey: "sys.stage1", audience: "boss", write: false },
  { key: "health", labelKey: "sys.stage2", audience: "boss", write: false },
  { key: "maintenance", labelKey: "sys.stage3", audience: "ops", write: false },
  { key: "ops", labelKey: "sys.stage4", audience: "ops", write: true },
] as const;
const VALID = new Set<string>(TABS.map((t) => t.key));

type Sub = { key: string; labelKey: string; node: React.ReactNode };

/**
 * P21-T5-4B：旧 tab key → 新 { tab, sub }。旧深链不 404、不静默跳错。
 * 六个旧 Tab 全部有归宿；外部重定向桩（/sync、/admin/verify、/admin/runtime）同步更新。
 */
const LEGACY_TAB: Record<string, { tab: string; sub?: string }> = {
  overview: { tab: "runtime", sub: "pipeline" },
  runtime: { tab: "runtime", sub: "metrics" },
  health: { tab: "health", sub: "guard" },
  verify: { tab: "health", sub: "readiness" },
  sync: { tab: "ops", sub: "sync" },
  deploy: { tab: "maintenance", sub: "deploy" },
  cron: { tab: "runtime", sub: "pipeline" },   // T2 已并入
  log: { tab: "runtime", sub: "metrics" },     // T2 已并入
};

export default function SystemHub() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab");
  const legacy = raw && !VALID.has(raw) ? LEGACY_TAB[raw] : undefined;
  const active = raw && VALID.has(raw) ? raw : legacy ? legacy.tab : "runtime";
  const rawSub = sp.get("sub") ?? legacy?.sub ?? null;

  const go = (tab: string, subKey?: string) => {
    const q = subKey ? `?tab=${tab}&sub=${subKey}` : `?tab=${tab}`;
    router.replace(`/admin/mission-control${q}`, { scroll: false });
  };

  const GROUPS: Record<string, Sub[]> = {
    // ① 运行状态：今日管线 + Runtime 指标（原 overview + runtime，T2 已并入 log）
    runtime: [
      { key: "pipeline", labelKey: "sys.s1.pipeline", node: <MissionControlView /> },
      { key: "metrics", labelKey: "sys.s1.metrics", node: <RuntimeView /> },
    ],
    // ② 数据健康：守卫摘要 + 生产就绪校验（verify 已剥离业务明细）
    health: [
      { key: "guard", labelKey: "sys.s2.guard", node: <HealthView /> },
      { key: "readiness", labelKey: "sys.s2.readiness", node: <VerifyView /> },
    ],
    // ③ 系统维护：股票池 + Mission 审计 + 版本部署（前两者原为无导航入口的内部页）
    maintenance: [
      { key: "universe", labelKey: "sys.s3.universe", node: <UniverseView /> },
      { key: "audit", labelKey: "sys.s3.audit", node: <MissionAuditView /> },
      { key: "deploy", labelKey: "sys.s3.deploy", node: <DeployView /> },
    ],
    // ④ 运维操作：唯一写操作区
    ops: [
      { key: "sync", labelKey: "sys.s4.sync", node: <SyncView /> },
    ],
  };

  const group = GROUPS[active] ?? GROUPS.runtime;
  const curSub = rawSub && group.some((g) => g.key === rawSub) ? rawSub : group[0].key;
  const cur = group.find((s) => s.key === curSub) ?? group[0];
  const activeTab = TABS.find((x) => x.key === active) ?? TABS[0];

  return (
    <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5">
        <SystemBreadcrumb stageKey={activeTab.labelKey} subKey={cur.labelKey} />

        {/* 阶段 Tab —— 写操作区以分隔线 + ⚠ 与只读区切开（不靠文字提醒，靠布局） */}
        <div className="mt-3 mb-5 overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max">
            {TABS.map((tab) => {
              const on = tab.key === active;
              return (
                <span key={tab.key} className="flex items-center gap-1.5">
                  {tab.write ? <span className="mx-1 h-5 w-px" style={{ background: COLORS.border }} /> : null}
                  <button
                    onClick={() => go(tab.key)}
                    className="px-3.5 py-2 rounded-xl text-[13px] whitespace-nowrap transition-colors active:scale-[0.99]"
                    style={{
                      background: on ? COLORS.text : COLORS.card,
                      color: on ? "#fff" : tab.write ? COLORS.warning : COLORS.textSecondary,
                      fontWeight: on ? 600 : 500,
                      border: `1px solid ${on ? COLORS.text : tab.write ? COLORS.warning : COLORS.border}`,
                    }}
                  >
                    {tab.write ? "⚠ " : ""}{t(tab.labelKey as Parameters<typeof t>[0])}
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        {/* 子标签（URL 可寻址） */}
        {group.length > 1 && (
          <div className="mb-4 overflow-x-auto">
            <div className="flex gap-1.5 min-w-max">
              {group.map((s) => {
                const on = s.key === cur.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => go(active, s.key)}
                    className="px-3 py-1.5 rounded-lg text-[12px] whitespace-nowrap transition-colors"
                    style={{
                      background: on ? COLORS.tile : "transparent",
                      color: on ? COLORS.text : COLORS.textSecondary,
                      fontWeight: on ? 600 : 500,
                    }}
                  >
                    {t(s.labelKey as Parameters<typeof t>[0])}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {cur.node}
      </div>
    </div>
  );
}
