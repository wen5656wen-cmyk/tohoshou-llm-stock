// ── 学习报告（P21-T2 · MERGE 承接）────────────────────────────────────────────
//
// 原为 /admin/research?tab=learning 的重定向桩，该 tab 已下线，故改为直接渲染。
//
// P21-T1 裁决 MERGE → AI 战绩档案，落地方式：
//   · **业绩统计部分**（胜率 / 收益 / Alpha，源自 backtest_position_results）与
//     AI 战绩档案同源重复 → 唯一权威入口已收敛到 /decision-v2?tab=history
//   · **数据完整性 / 回填进度 / 回归检测**是数据管线工程内容，不属于老板页面；
//     直接删除会造成能力丢失（违反「功能不减少」）→ 保留为内部页
//
// ⚠️ 内部页：**不进任何主导航**（nav-config 无节点、Research Hub 无 tab），
//   仅工程手输 URL 访问；其数据接口受 middleware + Route Guard 保护。

import LearningReportView from "@/components/research/LearningReportView";

export const dynamic = "force-dynamic";

export default function LearningReportPage() {
  return <LearningReportView />;
}
