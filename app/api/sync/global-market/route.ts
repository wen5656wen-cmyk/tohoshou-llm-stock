export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { guardAdminRoute } from "@/lib/admin-auth";
import { spawn } from "child_process";
import { join } from "path";

export async function GET(req: Request) {
  // P21-S2 纵深防御：middleware 之外的第二道闸门，必须先于任何副作用。
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  return NextResponse.json({ endpoint: "POST /api/sync/global-market — 触发 fetch-global-market.ts" });
}

export async function POST(req: Request) {
  // P21-S2 纵深防御：middleware 之外的第二道闸门，必须先于任何副作用。
  const denied = await guardAdminRoute(req);
  if (denied) return denied;
  const startMs = Date.now();

  return new Promise<NextResponse>((resolve) => {
    const cwd = process.cwd();
    const scriptPath = join(cwd, "scripts", "fetch-global-market.ts");

    const child = spawn("npx", ["tsx", scriptPath], {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let output = "";
    child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { output += d.toString(); });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(
        NextResponse.json(
          { success: false, error: "fetch-global-market 超时（50s）", output: output.slice(-500) },
          { status: 408 }
        )
      );
    }, 50_000);

    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startMs;
      if (code === 0) {
        const lines = output.split("\n").filter(Boolean);
        const summary = lines.slice(-3).join(" | ");
        resolve(
          NextResponse.json({
            success: true,
            status: "SUCCESS",
            message: "全球市场数据同步完成",
            durationMs,
            count: 1,
            synced: 1,
            summary,
            log: lines.slice(-10),
          })
        );
      } else {
        resolve(
          NextResponse.json(
            {
              success: false,
              error: `fetch-global-market 退出码 ${code ?? "killed"}`,
              output: output.slice(-800),
              durationMs,
            },
            { status: 500 }
          )
        );
      }
    });

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve(
        NextResponse.json(
          { success: false, error: `spawn 失败: ${err.message}` },
          { status: 500 }
        )
      );
    });
  });
}
