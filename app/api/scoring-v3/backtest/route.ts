import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

// GET /api/scoring-v3/backtest — 读取 reports/score-v3-backtest.json（V2/Alpha/Fusion/V3 对比）。只读。
export async function GET() {
  try {
    const file = path.join(process.cwd(), "reports", "score-v3-backtest.json");
    if (!fs.existsSync(file)) return NextResponse.json({ rows: [], note: "尚无 V3 回测结果，请运行 backtest-score-v3" });
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ rows: [], error: String(e) }, { status: 500 });
  }
}
