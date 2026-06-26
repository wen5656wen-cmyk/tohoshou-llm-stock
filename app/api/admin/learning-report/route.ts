import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "latest";  // "latest" | "summary" | "date=YYYY-MM-DD"
  const dateParam = searchParams.get("date");

  try {
    const reportsDir = path.join(process.cwd(), "reports");

    let filename: string;
    if (dateParam) {
      filename = `learning-report-${dateParam}.json`;
    } else if (mode === "summary") {
      filename = "learning-summary.json";
    } else {
      filename = "latest-learning.json";
    }

    const filePath = path.join(reportsDir, filename);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "Report not found", filename, hint: "Run npm run learning:report to generate" },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(filePath, "utf-8");
    return new NextResponse(content, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
