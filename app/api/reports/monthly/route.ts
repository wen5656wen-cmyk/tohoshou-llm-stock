import { NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const REPORTS_DIR = join(process.cwd(), "reports", "monthly");

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const label = searchParams.get("label"); // e.g. "2026-06"

  if (!existsSync(REPORTS_DIR)) {
    return NextResponse.json({ files: [], content: null, latest: null });
  }

  const files = readdirSync(REPORTS_DIR)
    .filter((f) => /^\d{4}-\d{2}\.md$/.test(f))
    .sort()
    .reverse(); // newest first

  const latest = files[0]?.replace(".md", "") ?? null;

  const target = label ?? latest;
  if (!target) {
    return NextResponse.json({ files: files.map((f) => f.replace(".md", "")), content: null, latest: null });
  }

  const filePath = join(REPORTS_DIR, `${target}.md`);
  if (!existsSync(filePath)) {
    return NextResponse.json({ files: files.map((f) => f.replace(".md", "")), content: null, latest }, { status: 404 });
  }

  const content = readFileSync(filePath, "utf-8");
  return NextResponse.json({
    files:   files.map((f) => f.replace(".md", "")),
    latest,
    label:   target,
    content,
  });
}
