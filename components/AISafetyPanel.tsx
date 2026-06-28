"use client";

import {
  RULE_ENGINE_VERSION,
  GLOBAL_EVENT_ENGINE_VERSION,
  SCORING_SCHEMA_VERSION,
  TOHOSHOU_MODEL_VERSION,
  LLM_MODEL_VERSION,
} from "@/lib/safety-rules";

interface RuleRow {
  name: string;
  status: "enabled" | "disabled" | "partial";
  detail: string;
}

const RULES: RuleRow[] = [
  {
    name: "时间铁律 No Look-Ahead Bias",
    status: "enabled",
    detail: `News tradeEffectiveDate 自动计算，JST 15:00 截止，周末/节假日顺延`,
  },
  {
    name: "标准化评分 Normalization",
    status: "enabled",
    detail: "ImpactLevel 枚举 → sigmaImpact 映射，LLM 禁止直接写任意分数",
  },
  {
    name: "置信度守卫 Confidence Guard",
    status: "enabled",
    detail: "overallConfidence < 60 禁 STRONG_BUY；< 40 最高 WATCH",
  },
  {
    name: "风险熔断 Risk Override",
    status: "enabled",
    detail: "SOFT_BLOCK: STRONG_BUY→BUY / BUY→WATCH；HARD_BLOCK: 封顶 WATCH",
  },
  {
    name: "版本冻结 Version Freeze",
    status: "enabled",
    detail: `ruleEngine=${RULE_ENGINE_VERSION} globalEvent=${GLOBAL_EVENT_ENGINE_VERSION} schema=${SCORING_SCHEMA_VERSION}`,
  },
  {
    name: "影子模式 Shadow Mode",
    status: TOHOSHOU_MODEL_VERSION === "disabled" ? "disabled" : "partial",
    detail: `TOHOSHOU MODEL: ${TOHOSHOU_MODEL_VERSION}（生产权重 0，后台 shadow score 待接入）`,
  },
  {
    name: "同步防僵尸 SyncJob Stale Guard",
    status: "enabled",
    detail: "RUNNING job > 2h 自动 FAILED；cron 区分 ✅ / ⚠️ SKIPPED / ⚠️ STALE_RESET",
  },
];

const STATUS_CFG = {
  enabled:  { dot: "bg-green-400",  label: "已启用",  cls: "text-green-700" },
  disabled: { dot: "bg-slate-300",  label: "已禁用", cls: "text-slate-500" },
  partial:  { dot: "bg-yellow-400", label: "部分启用",  cls: "text-yellow-700" },
};

export function AISafetyPanel() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🛡️</span>
        <h2 className="text-base font-semibold text-slate-800">
          TOHOSHOU AI 安全规范
        </h2>
        <span className="ml-auto text-xs text-slate-400 font-mono">
          Decision Engine {RULE_ENGINE_VERSION} · LLM {LLM_MODEL_VERSION}
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {RULES.map((rule) => {
          const cfg = STATUS_CFG[rule.status];
          return (
            <div key={rule.name} className="flex items-start gap-3 py-2.5">
              <span className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">{rule.name}</span>
                  <span className={`text-xs font-mono ${cfg.cls}`}>{cfg.label}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{rule.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-3 text-xs text-slate-400 font-mono">
        <span>schema={SCORING_SCHEMA_VERSION}</span>
        <span>globalEvent={GLOBAL_EVENT_ENGINE_VERSION}</span>
        <span>tohoshou={TOHOSHOU_MODEL_VERSION}</span>
      </div>
    </div>
  );
}
