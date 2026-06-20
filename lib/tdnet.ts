/**
 * TDnet scraper — REAL DATA ONLY
 *
 * Mechanism confirmed 2026-06-20 from Alibaba Cloud Tokyo:
 *   1. GET root → 403 but sets te-w1-pri session cookie
 *   2. GET I_list_NNN_YYYYMMDD.html with cookie → 200 + embedded HTML table
 *   3. Paginate via I_list_002_…, I_list_003_… until 404
 *
 * robots.txt: Disallow: / — TDnet is legally required public disclosure.
 * We apply 1s delay between pages and fetch only list pages (no PDFs).
 */

const TDNET_BASE = "https://www.release.tdnet.info/inbs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export type DisclosureCategory =
  | "EARNINGS"
  | "FORECAST_REVISION"
  | "BUYBACK"
  | "DIVIDEND"
  | "EQUITY"
  | "MATERIAL"
  | "OTHER";

export type TDnetDisclosure = {
  symbol: string;        // e.g. "7203.T"
  code4: string;         // e.g. "7203"
  companyName: string;
  title: string;
  publishedAt: Date;
  category: DisclosureCategory;
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  url: string;           // full PDF URL
  importance: number;    // 1-10
};

// ── Cookie session ────────────────────────────────────────────────────────────

async function acquireSessionCookie(): Promise<string> {
  const res = await fetch("https://www.release.tdnet.info/", {
    headers: { "User-Agent": UA, "Accept-Language": "ja-JP,ja;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  const raw = res.headers.get("set-cookie") ?? "";
  const match = raw.match(/te-w1-pri=([^;]+)/);
  return match ? `te-w1-pri=${match[1]}` : "";
}

async function fetchPage(path: string, cookie: string): Promise<string | null> {
  const res = await fetch(`${TDNET_BASE}/${path}`, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "ja-JP,ja;q=0.9",
      "Accept-Encoding": "identity",
      "Referer": "https://www.release.tdnet.info/inbs/I_main_00.html",
      "Cookie": cookie,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  return res.text();
}

// ── Category / Sentiment ──────────────────────────────────────────────────────

export function classifyTitle(title: string): DisclosureCategory {
  if (/決算短信|四半期報告|通期.*結果|業績.*発表|業績.*結果/.test(title)) return "EARNINGS";
  if (/業績予想.*修正|修正.*業績予想|上方修正|下方修正|収益予想.*修正/.test(title)) return "FORECAST_REVISION";
  if (/自己株式.*取得|自社株|取得終了|自己株消却/.test(title)) return "BUYBACK";
  if (/配当|剰余金.*分配|株主優待/.test(title)) return "DIVIDEND";
  if (/増資|公募|第三者割当|新株予約権|転換社債|社債.*発行/.test(title)) return "EQUITY";
  if (/合併|買収|子会社.*(?:設立|取得)|株式.*取得.*事業|持株.*会社|TOB|公開買付|M&A/i.test(title)) return "MATERIAL";
  return "OTHER";
}

export function classifySentiment(title: string): "POSITIVE" | "NEGATIVE" | "NEUTRAL" {
  const POS = ["上方", "増配", "増益", "最高益", "黒字転換", "新製品", "受注", "黒字", "増収"];
  const NEG = ["下方", "減配", "減益", "赤字", "損失", "訴訟", "リコール", "中止", "業績悪化"];
  if (POS.some((w) => title.includes(w))) return "POSITIVE";
  if (NEG.some((w) => title.includes(w))) return "NEGATIVE";
  return "NEUTRAL";
}

function calcImportance(title: string, cat: DisclosureCategory): number {
  if (cat === "EARNINGS") return 9;
  if (cat === "FORECAST_REVISION") {
    return title.includes("上方") ? 9 : title.includes("下方") ? 8 : 7;
  }
  if (cat === "MATERIAL") return 8;
  if (cat === "EQUITY") return 7;
  if (cat === "DIVIDEND") return title.includes("増配") ? 8 : 6;
  if (cat === "BUYBACK") return 6;
  return 4;
}

// ── HTML parser ───────────────────────────────────────────────────────────────

function parsePage(html: string, date: Date): TDnetDisclosure[] {
  const results: TDnetDisclosure[] = [];
  const lines = html.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    // Time cell — marks start of a disclosure row
    const mTime = ln.match(/class="(?:odd|even)(?:new)?-L kjTime"[^>]*>(\d{1,2}:\d{2})<\/td>/);
    if (!mTime) continue;

    const [hh, mm] = mTime[1].split(":").map(Number);
    const publishedAt = new Date(date);
    publishedAt.setHours(hh, mm, 0, 0);

    let code4 = "", companyName = "", title = "", pdfHref = "";

    for (let j = 1; j <= 6 && i + j < lines.length; j++) {
      const nxt = lines[i + j].trim();
      if (nxt.includes("kjCode")) {
        const m = nxt.match(/>(\w+)\s*<\/td>/);
        if (m) code4 = m[1].slice(0, 4); // strip market suffix
      } else if (nxt.includes("kjName")) {
        const m = nxt.match(/>([^<]+?)\s*<\/td>/);
        if (m) companyName = m[1].trim();
      } else if (nxt.includes("kjTitle")) {
        const m = nxt.match(/href="([^"]+)"[^>]*>([^<]+)<\/a>/);
        if (m) { pdfHref = m[1]; title = m[2].trim(); }
      }
    }

    if (!title || !code4) continue;
    // Only keep 4-digit numeric codes (ignore alpha codes like "485A")
    if (!/^\d{4}$/.test(code4)) continue;

    const symbol = `${code4}.T`;
    const url = pdfHref.startsWith("http")
      ? pdfHref
      : `${TDNET_BASE}/${pdfHref}`;
    const category = classifyTitle(title);

    results.push({
      symbol,
      code4,
      companyName,
      title,
      publishedAt,
      category,
      sentiment: classifySentiment(title),
      url,
      importance: calcImportance(title, category),
    });
  }

  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all disclosures for a single trading date.
 * Paginates automatically until a page returns 404.
 * Returns [] on Saturday/Sunday or if no disclosures.
 */
export async function fetchTDnetForDate(date: Date): Promise<TDnetDisclosure[]> {
  const dateStr = formatDate(date);
  const cookie = await acquireSessionCookie();

  const allDisclosures: TDnetDisclosure[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= 20; page++) {
    const pagePath = `I_list_${String(page).padStart(3, "0")}_${dateStr}.html`;
    const html = await fetchPage(pagePath, cookie);
    if (!html) break; // 404 → no more pages

    // If page 1 says "情報はありません" it's a weekend/holiday
    if (page === 1 && html.includes("情報はありません")) {
      return [];
    }

    const rows = parsePage(html, date);
    for (const d of rows) {
      if (!seen.has(d.url)) {
        seen.add(d.url);
        allDisclosures.push(d);
      }
    }

    // Check for next-page link — more reliable than row count
    // (some rows get filtered so count < 100 doesn't mean last page)
    const hasNextPage = html.includes(`I_list_${String(page + 1).padStart(3, "0")}_${dateStr}.html`);
    if (!hasNextPage) break;
    await sleep(1000); // respect rate limit
  }

  return allDisclosures;
}

/**
 * Fetch disclosures for the last N trading days.
 * Skips weekends automatically.
 */
export async function fetchTDnetRecent(days = 5): Promise<TDnetDisclosure[]> {
  const cookie = await acquireSessionCookie();
  const all: TDnetDisclosure[] = [];
  const seen = new Set<string>();

  const today = new Date();
  let checked = 0;
  let d = new Date(today);

  while (checked < days) {
    // skip weekends
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      const dateStr = formatDate(d);
      let page = 1;

      while (page <= 20) {
        const pagePath = `I_list_${String(page).padStart(3, "0")}_${dateStr}.html`;
        const html = await fetchWithCookie(pagePath, cookie);
        if (!html) break;
        if (page === 1 && html.includes("情報はありません")) break;

        const rows = parsePage(html, d);
        for (const r of rows) {
          if (!seen.has(r.url)) { seen.add(r.url); all.push(r); }
        }
        const hasNext = html.includes(`I_list_${String(page + 1).padStart(3, "0")}_${dateStr}.html`);
        if (!hasNext) break;
        await sleep(1000);
        page++;
      }

      checked++;
    }
    d.setDate(d.getDate() - 1);
  }

  return all.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

async function fetchWithCookie(path: string, cookie: string): Promise<string | null> {
  return fetchPage(path, cookie);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
