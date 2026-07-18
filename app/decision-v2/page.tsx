// ── Decision v2（并行预览 · P14-DEV-01）──────────────────────────────────────
// 新 Decision 工作台的并行落地路由；生产 /decision-center 与 / 不受影响，
// 9 阶段全部完成并验收通过后再一次性切换。
import DecisionWorkspace from "@/components/decision/DecisionWorkspace";

export const dynamic = "force-dynamic";

export default function DecisionV2Page() {
  return <DecisionWorkspace />;
}
