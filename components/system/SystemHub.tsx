"use client";

// ── Mission Control Hub（P7-06 · 系统工作区唯一入口）─────────────────────────
// 8 顶级 Tab：系统概览/Runtime/Health/数据校验/同步/Cron/部署/日志。
// 各 Tab 懒加载(next/dynamic)+仅激活挂载；?tab= URL 同步，刷新保持；移动端横向滚动。
// 复用现有页面/面板/API，不复制代码/API。系统概览=既有 Mission Control 聚合，纯展示。

import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n";
import { AppHeader, AppLoading, COLORS } from "@/components/ui";

const spin = () => <AppLoading />;
const MissionControlView = dynamic(() => import("./MissionControlView"), { ssr: false, loading: spin });
const RuntimeView = dynamic(() => import("./RuntimeView"), { ssr: false, loading: spin });
const HealthView = dynamic(() => import("./HealthView"), { ssr: false, loading: spin });
const VerifyView = dynamic(() => import("./VerifyView"), { ssr: false, loading: spin });
const SyncView = dynamic(() => import("./SyncView"), { ssr: false, loading: spin });
const CronView = dynamic(() => import("./CronView"), { ssr: false, loading: spin });
const DeployView = dynamic(() => import("./DeployView"), { ssr: false, loading: spin });
const LogView = dynamic(() => import("./LogView"), { ssr: false, loading: spin });

const TABS = [
  { key: "overview", labelKey: "sys.tab.overview" },
  { key: "runtime", labelKey: "sys.tab.runtime" },
  { key: "health", labelKey: "sys.tab.health" },
  { key: "verify", labelKey: "sys.tab.verify" },
  { key: "sync", labelKey: "sys.tab.sync" },
  { key: "cron", labelKey: "sys.tab.cron" },
  { key: "deploy", labelKey: "sys.tab.deploy" },
  { key: "log", labelKey: "sys.tab.log" },
] as const;
const VALID = new Set<string>(TABS.map((t) => t.key));

export default function SystemHub() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab");
  const active = raw && VALID.has(raw) ? raw : "overview";
  const go = (key: string) => { if (key !== active) router.replace(`/admin/mission-control?tab=${key}`, { scroll: false }); };

  return (
    <div className="dash-font" style={{ background: COLORS.background, minHeight: "100vh" }}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5">
        <AppHeader title={t("ws.systemOverview")} />

        <div className="mt-4 mb-5 overflow-x-auto">
          <div className="flex gap-1.5 min-w-max">
            {TABS.map((tab) => {
              const on = tab.key === active;
              return (
                <button
                  key={tab.key}
                  onClick={() => go(tab.key)}
                  className="px-3.5 py-2 rounded-xl text-[13px] whitespace-nowrap transition-colors active:scale-[0.99]"
                  style={{
                    background: on ? COLORS.text : COLORS.card,
                    color: on ? "#fff" : COLORS.textSecondary,
                    fontWeight: on ? 600 : 500,
                    border: `1px solid ${on ? COLORS.text : COLORS.border}`,
                  }}
                >
                  {t(tab.labelKey as Parameters<typeof t>[0])}
                </button>
              );
            })}
          </div>
        </div>

        {active === "overview" && <MissionControlView />}
        {active === "runtime" && <RuntimeView />}
        {active === "health" && <HealthView />}
        {active === "verify" && <VerifyView />}
        {active === "sync" && <SyncView />}
        {active === "cron" && <CronView />}
        {active === "deploy" && <DeployView />}
        {active === "log" && <LogView />}
      </div>
    </div>
  );
}
