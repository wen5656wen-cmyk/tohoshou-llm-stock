/**
 * Kabutan.jp stock-specific news scraper.
 *
 * URL pattern: https://kabutan.jp/stock/news?code=XXXX
 *
 * HTML structure observed:
 *   <tr>
 *     <td class="news_time">2026/06/17 09:33</td>
 *     <td class="newslist_ctg newsctg_kaiji_b">開示</td>   ← category
 *     <td><a href="/stock/news?code=XXXX&b=nNNN">Title</a></td>
 *   </tr>
 *
 * Category → confidence mapping:
 *   newsctg_kaiji_b (開示/disclosure) → 95  (company-filed disclosure)
 *   other categories shown in context → 35  (general market news)
 */

import { parse as parseHtml } from "node-html-parser";
import { classifyCategory, calcImportance, classifySentiment, type NewsCategory } from "./news-utils";

export type KabutanNewsItem = {
  title: string;
  url: string;
  publishedAt: Date;
  source: string;
  category: NewsCategory;
  importance: number;
  sentiment: string;
  relatedSymbolConfidence: number;
};

const KABUTAN_BASE = "https://kabutan.jp";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "ja-JP,ja;q=0.9",
  "Referer": "https://kabutan.jp/",
};

export async function fetchKabutanNews(symbol: string): Promise<KabutanNewsItem[]> {
  const code = symbol.replace(/\.[A-Z]+$/, "");
  const url = `${KABUTAN_BASE}/stock/news?code=${code}`;

  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const html = await res.text();
    if (!html.includes("kabutan") || html.length < 1000) return [];

    const root = parseHtml(html);
    const items: KabutanNewsItem[] = [];
    const seen = new Set<string>();

    // Primary: parse table rows
    // Each row has: [news_time cell] [newslist_ctg cell] [link cell]
    const rows = root.querySelectorAll("tr");

    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 2) continue;

      // Find the link cell with a stock-specific article
      const linkEl = row.querySelector(`a[href*="/stock/news?code=${code}&b="]`);
      if (!linkEl) continue;

      const title = linkEl.text?.trim() || "";
      const href = linkEl.getAttribute("href") || "";
      if (!title || !href || seen.has(href)) continue;
      seen.add(href);

      const fullUrl = href.startsWith("http") ? href : `${KABUTAN_BASE}${href}`;

      // Determine confidence from category element class
      // newsctg_kaiji_b = 適時開示 (company-specific disclosure) → 95
      // newsctg2_b = 材料ニュース (material mentioning this stock) → 50
      // newsctg4_b = テクニカル (technical analysis) → 25
      // newsctg5_b = 特集 (feature article) → 25
      // newsctg1_b = 市況 (market conditions) → 20
      // The class is on a <div> inside <td>, NOT on the <td> itself
      const catEl = row.querySelector(".newslist_ctg");
      const catClass = catEl?.getAttribute("class") || "";
      const isDisclosure = catClass.includes("newsctg_kaiji_b");
      const isMaterial  = catClass.includes("newsctg2_b");
      const confidence = isDisclosure ? 95 : isMaterial ? 50 : 25;

      // Date cell: class="news_time"
      const timeCell = row.querySelector("td.news_time") ?? cells[0];
      const dateText = timeCell?.text?.trim() || "";
      const publishedAt = parseKabutanDate(dateText) || new Date();

      const category = isDisclosure ? classifyCategory(title) : isMaterial ? "IR" : "MARKET";
      const importance = isDisclosure
        ? Math.max(calcImportance(title, classifyCategory(title)), 6)
        : isMaterial ? 5 : 3;
      const sentiment = classifySentiment(title);

      items.push({
        title,
        url: fullUrl,
        publishedAt,
        source: "Kabutan",
        category,
        importance,
        sentiment,
        relatedSymbolConfidence: confidence,
      });

      if (items.length >= 15) break;
    }

    return items;
  } catch (e) {
    console.warn(`[kabutan] fetch failed ${symbol}:`, (e as Error).message);
    return [];
  }
}

function parseKabutanDate(s: string): Date | null {
  const valid = (d: Date) => !isNaN(d.getTime()) ? d : null;
  // "2024/01/15 09:00" or "2024-01-15"
  const full = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (full) {
    const [, y, m, d, h = "0", min = "0"] = full;
    return valid(new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${min.padStart(2, "0")}:00+09:00`));
  }
  // "01/15 09:00"
  const short = s.match(/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (short) {
    const year = new Date().getFullYear();
    const [, m, d, h = "0", min = "0"] = short;
    return valid(new Date(`${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${min.padStart(2, "0")}:00+09:00`));
  }
  return null;
}
