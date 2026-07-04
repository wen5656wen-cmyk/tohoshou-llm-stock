// scripts/smoke-legacy-routes.ts — P4-T4 验证 Legacy 路由重定向（307/308 + Location 正确）
// 用法：npm run smoke:legacy    或    BASE=http://localhost:3000 npm run smoke:legacy
// 只读：不触碰 DB / API 逻辑 / cron。

const BASE = (process.env.BASE ?? "https://aitohoshou.com").replace(/\/$/, "");

// Legacy → 目标（研究中心真实 tab key / 首页）
const MAP: Record<string, string> = {
  "/alpha": "/admin/research?tab=factors",
  "/alpha/score": "/admin/research?tab=score",
  "/alpha/backtest": "/admin/research?tab=backtest",
  "/alpha/report": "/admin/research?tab=analytics",
  "/fusion/paper": "/admin/research?tab=fusion",
  "/fusion/report": "/admin/research?tab=fusion",
  "/ai-picks": "/",
};

function matches(locationHeader: string, want: string): boolean {
  const loc = locationHeader.replace(BASE, ""); // Next 可能返回绝对或相对 Location
  const [wantPath, wantQuery] = want.split("?");
  if (!loc.startsWith(wantPath)) return false;
  if (wantQuery && !loc.includes(wantQuery)) return false;
  return true;
}

async function main() {
  const rows: string[] = [];
  let pass = 0, fail = 0;
  for (const [src, want] of Object.entries(MAP)) {
    try {
      const res = await fetch(BASE + src, { redirect: "manual" });
      const loc = res.headers.get("location") ?? "";
      const ok = (res.status === 307 || res.status === 308) && matches(loc, want);
      rows.push(`${ok ? "✅ PASS" : "❌ FAIL"}  ${src.padEnd(18)} [${res.status}] → ${loc.replace(BASE, "") || "(none)"}   want ${want}`);
      ok ? pass++ : fail++;
    } catch (e) {
      rows.push(`❌ FAIL  ${src.padEnd(18)} error: ${String(e)}`);
      fail++;
    }
  }
  console.log(`Legacy route smoke · BASE=${BASE}\n`);
  console.log(rows.join("\n"));
  console.log(`\n${pass}/${pass + fail} PASS`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
