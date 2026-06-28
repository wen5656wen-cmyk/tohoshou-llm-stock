#!/usr/bin/env npx tsx
/**
 * i18n:scan — 扫描 app/ components/ 中仍硬编码的英文用户界面字符串
 * 输出：文件名 + 行号 + 匹配内容（仅展示，不修改）
 *
 * 豁免：股票代码、CLI命令、版本号、技术缩写、注释、import 语句
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// 扫描目录
const SCAN_DIRS = ["app", "components"];

// 豁免模式（命中即跳过整行）
const EXEMPT_PATTERNS = [
  /^\s*\/\//, // 注释行
  /^\s*\*/, // JSDoc
  /^\s*import\s/, // import
  /^\s*export\s+(type|interface)/, // 类型导出
  /href=|src=|className=|style=\{|data-/, // 属性值（非文本）
  /console\.(log|warn|error|info)/, // 日志
  /throw new |Error\(/, // 错误构造
  /\.(ts|tsx|js|json|css|svg|png|jpg)['"]/, // 文件路径
  /npm run |npx |tsx |prisma |git |sql /i, // CLI 命令
  /\$\{/, // 模板字面量（跳过，太多误报）
  /"use client"|"use server"/, // Next.js 指令
  /key=\{|value=\{|type="|placeholder=/, // 非文本属性
  /\bAPI\b|\bJSON\b|\bSQL\b|\bGit\b|\bCron\b|\bPrisma\b|\bPM2\b/, // 技术术语
  /TDnet|J-Quants|Yahoo Finance|TOPIX|JST|CST|UTC/, // 品牌/时区
  /7203\.T|1306\.T|feat_\*|schema-v|v\d+\.\d+/, // 技术标识符
  /\bRSI\b|\bMACD\b|\bROE\b|\bEPS\b|\bP\/E\b|\bP\/B\b/, // 金融缩写（允许保留）
  /const |let |type |interface |function |return |export |default /, // 代码关键字
  /getStatusLabel|getPipelineLabel|STATUS_LABELS|PIPELINE_STAGE/, // 我们的 label 函数
];

// 用于检测英文的正则（字母序列 ≥ 4 个字符，不含 CJK）
const HAS_ENGLISH = /[A-Za-z]{4,}/;

// 不需要标记的短英文词（UI 惯例或确认豁免）
const KNOWN_OK = new Set([
  "TOHOSHOU", "AI", "ETF", "EMS", "API", "PDF", "JST", "UTC", "CST",
  "TOPIX", "DRY", "BUY", "HOLD", "WATCH", "AVOID", "STRONG",
  "DAY", "SWING", "POSITION", "OPEN",
  "Pearson", "Alpha",
  "PASS", "FAIL", // 保留在技术日志模板中
  "PACK", "SHIP", "TAX",
]);

interface Finding {
  file: string;
  line: number;
  text: string;
}

function isExempt(line: string): boolean {
  return EXEMPT_PATTERNS.some((p) => p.test(line));
}

async function scanFile(filePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  let lineNo = 0;
  for await (const raw of rl) {
    lineNo++;
    if (isExempt(raw)) continue;
    if (!HAS_ENGLISH.test(raw)) continue;

    // 提取 JSX 字符串内容：>...text...</ 或 "..." 或 `...`
    const textMatches = raw.match(/>\s*([^<{]+)\s*<|["'`]([A-Za-z][^"'`]{3,}?)["'`]/g) ?? [];
    for (const m of textMatches) {
      const inner = m.replace(/^[>"'`\s]+/, "").replace(/[<"'`\s]+$/, "");
      if (!inner || !HAS_ENGLISH.test(inner)) continue;
      // Skip if it's a known OK term or all-caps abbreviation
      const words = inner.split(/\s+/);
      if (words.every((w) => KNOWN_OK.has(w.toUpperCase()))) continue;
      // Skip if it looks like a field name / code identifier
      if (/^[a-z][a-zA-Z]+$/.test(inner) && !/\s/.test(inner)) continue;
      // Skip if it's all-caps and short (enum-like)
      if (/^[A-Z_]{2,10}$/.test(inner)) continue;

      findings.push({ file: filePath, line: lineNo, text: inner.trim() });
    }
  }
  return findings;
}

function walk(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !["node_modules", ".next", "dist"].includes(entry.name)) {
      files.push(...walk(full));
    } else if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const root = process.cwd();
  const allFiles = SCAN_DIRS.flatMap((d) => walk(path.join(root, d)));

  let total = 0;
  const byFile: Record<string, Finding[]> = {};

  for (const f of allFiles) {
    const results = await scanFile(f);
    if (results.length > 0) {
      const rel = path.relative(root, f);
      byFile[rel] = results;
      total += results.length;
    }
  }

  if (total === 0) {
    console.log("✅ 用户界面英文残留：0");
    process.exit(0);
  }

  console.log(`⚠ 发现 ${total} 处潜在英文残留：\n`);
  for (const [file, findings] of Object.entries(byFile)) {
    console.log(`📄 ${file}`);
    for (const f of findings) {
      console.log(`   行 ${f.line}: ${f.text}`);
    }
    console.log();
  }
  console.log(`共 ${total} 处，请逐一确认是否需要翻译。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
