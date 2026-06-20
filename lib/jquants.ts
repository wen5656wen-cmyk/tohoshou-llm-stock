/**
 * J-Quants API Client
 *
 * Auth flow (V1):
 *   1. POST /v1/token/auth_user  { mailaddress, password } → { refreshToken }
 *   2. POST /v1/token/auth_refresh?refreshtoken=xxx       → { idToken }
 *   3. All data requests: Authorization: Bearer <idToken>
 *
 * Env vars (priority order):
 *   JQUANTS_EMAIL + JQUANTS_PASSWORD  → full auth flow
 *   JQUANTS_REFRESH_TOKEN              → skip step 1
 *   JQUANTS_API_KEY                    → backward-compat (x-api-key header, V2 only)
 */

const JQUANTS_BASE = "https://api.jquants.com";
const DATA_BASE_V2 = `${JQUANTS_BASE}/v2`;

// ── Token cache (server-side singleton) ────────────────────────────────────

let cachedIdToken: string | null = null;
let tokenExpiresAt = 0; // epoch ms

// ── Configuration ─────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!(
    (process.env.JQUANTS_EMAIL && process.env.JQUANTS_PASSWORD) ||
    process.env.JQUANTS_REFRESH_TOKEN ||
    process.env.JQUANTS_API_KEY
  );
}

export function configStatus(): { ok: boolean; method: string; missing?: string } {
  if (process.env.JQUANTS_EMAIL && process.env.JQUANTS_PASSWORD) {
    return { ok: true, method: "email+password (V1)" };
  }
  if (process.env.JQUANTS_REFRESH_TOKEN) {
    return { ok: true, method: "refresh_token (V1)" };
  }
  if (process.env.JQUANTS_API_KEY) {
    return { ok: true, method: "api_key (V2 backward-compat)" };
  }
  return {
    ok: false,
    method: "none",
    missing: "未配置 J-Quants 账号（需设置 JQUANTS_EMAIL + JQUANTS_PASSWORD 或 JQUANTS_REFRESH_TOKEN）",
  };
}

// ── Safe JSON parser with content-type guard ───────────────────────────────

async function safeJson(res: Response, context: string): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "(unreadable)");
    throw new Error(
      `J-Quants 返回非 JSON (${context})，可能是 API 地址错误或登录失败。` +
      `HTTP ${res.status}，content-type: ${contentType}，响应前300字: ${text.slice(0, 300)}`
    );
  }
  return res.json();
}

// ── V1 Auth flow ─────────────────────────────────────────────────────────

async function getRefreshTokenFromCreds(): Promise<string> {
  const mailaddress = process.env.JQUANTS_EMAIL;
  const password = process.env.JQUANTS_PASSWORD;

  if (!mailaddress || !password) {
    throw new Error("未配置 J-Quants 账号（需设置 JQUANTS_EMAIL + JQUANTS_PASSWORD）");
  }

  const res = await fetch(`${JQUANTS_BASE}/v1/token/auth_user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mailaddress, password }),
    redirect: "error",
  });

  const data = await safeJson(res, "v1/token/auth_user") as { refreshToken?: string; message?: string };

  if (!res.ok || !data.refreshToken) {
    throw new Error(`J-Quants 登录失败: ${data.message ?? JSON.stringify(data)}`);
  }

  return data.refreshToken;
}

async function fetchIdToken(refreshToken: string): Promise<string> {
  const res = await fetch(
    `${JQUANTS_BASE}/v1/token/auth_refresh?refreshtoken=${encodeURIComponent(refreshToken)}`,
    { method: "POST", redirect: "error" }
  );

  const data = await safeJson(res, "v1/token/auth_refresh") as { idToken?: string; message?: string };

  if (!res.ok || !data.idToken) {
    throw new Error(`J-Quants 获取 idToken 失败: ${data.message ?? JSON.stringify(data)}`);
  }

  return data.idToken;
}

async function getIdToken(): Promise<string> {
  // 1. Backward-compat: use raw API key directly (V2 x-api-key)
  if (process.env.JQUANTS_API_KEY && !process.env.JQUANTS_EMAIL && !process.env.JQUANTS_REFRESH_TOKEN) {
    return process.env.JQUANTS_API_KEY;
  }

  // 2. Return cached idToken if still fresh
  if (cachedIdToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedIdToken;
  }

  // 3. Get refreshToken
  const refreshToken = process.env.JQUANTS_REFRESH_TOKEN ?? await getRefreshTokenFromCreds();

  // 4. Exchange for idToken
  const idToken = await fetchIdToken(refreshToken);
  cachedIdToken = idToken;
  tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000; // 23h TTL

  return idToken;
}

// ── Core HTTP helper ────────────────────────────────────────────────────────

async function jquantsGet(path: string, retry = true): Promise<unknown> {
  const token = await getIdToken();

  // API key path: x-api-key header; idToken path: Bearer header
  const useApiKey =
    process.env.JQUANTS_API_KEY &&
    !process.env.JQUANTS_EMAIL &&
    !process.env.JQUANTS_REFRESH_TOKEN;

  const headers: Record<string, string> = useApiKey
    ? { "x-api-key": token }
    : { Authorization: `Bearer ${token}` };

  const res = await fetch(`${DATA_BASE_V2}${path}`, { headers, redirect: "error" });

  // Token expired → clear cache and retry once
  if ((res.status === 401 || res.status === 403) && retry && !useApiKey) {
    cachedIdToken = null;
    tokenExpiresAt = 0;
    return jquantsGet(path, false);
  }

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const text = await res.text().catch(() => "(unreadable)");
      throw new Error(
        `J-Quants GET ${path} 失败: HTTP ${res.status}，返回非 JSON: ${text.slice(0, 300)}`
      );
    }
    const body = await res.text().catch(() => "");
    throw new Error(`J-Quants GET ${path} 失败: ${res.status} ${body}`);
  }

  return safeJson(res, path);
}

// ── Utility conversions ─────────────────────────────────────────────────────

// Convert "7203.T" → "72030" (J-Quants 5-digit code)
export function toJQuantsCode(symbol: string): string {
  const code = symbol.replace(/\.[A-Z]+$/, "");
  if (code.length === 4) return code + "0";
  return code;
}

// Convert "72030" → "7203.T"
export function fromJQuantsCode(code: string): string {
  if (code.length === 5) return code.slice(0, 4) + ".T";
  return code + ".T";
}

// ── Equities Master ─────────────────────────────────────────────────────────

export type JQListedInfo = {
  Date: string;
  Code: string;
  CoName: string;
  CoNameEn: string;
  S17: string;
  S17Nm: string;
  S33: string;
  S33Nm: string;
  ScaleCat: string;
  Mkt: string;
  MktNm: string;
};

export async function getListedInfo(code?: string): Promise<JQListedInfo[]> {
  const q = code ? `?code=${code}` : "";
  const data = await jquantsGet(`/equities/master${q}`) as { data: JQListedInfo[] };
  return data.data || [];
}

// ── Daily Bars ───────────────────────────────────────────────────────────────

export type JQDailyBar = {
  Date: string;
  Code: string;
  O: number;
  H: number;
  L: number;
  C: number;
  Vo: number;
  Va: number;
  AdjFactor: number;
  AdjO: number;
  AdjH: number;
  AdjL: number;
  AdjC: number;
  AdjVo: number;
};

export async function getDailyBars(
  symbol: string,
  from: string,
  to: string
): Promise<JQDailyBar[]> {
  const code = toJQuantsCode(symbol);
  const data = await jquantsGet(
    `/equities/bars/daily?code=${code}&dateFrom=${from}&dateTo=${to}`
  ) as { data: JQDailyBar[]; pagination_key?: string };

  let rows = data.data || [];
  let paginationKey = data.pagination_key;

  while (paginationKey) {
    const next = await jquantsGet(
      `/equities/bars/daily?code=${code}&dateFrom=${from}&dateTo=${to}&pagination_key=${encodeURIComponent(paginationKey)}`
    ) as { data: JQDailyBar[]; pagination_key?: string };
    rows = rows.concat(next.data || []);
    paginationKey = next.pagination_key;
  }

  return rows;
}

// ── Financial Summary ────────────────────────────────────────────────────────

export type JQFinSummary = {
  DiscDate: string;
  Code: string;
  DocType: string;
  CurPerType: string;
  CurPerSt: string;
  CurPerEn: string;
  CurFYSt: string;
  CurFYEn: string;
  Sales: string | null;
  OP: string | null;
  OdP: string | null;
  NP: string | null;
  EPS: string | null;
  DEPS: string | null;
  TA: string | null;
  Eq: string | null;
  EqAR: string | null;
  BPS: string | null;
  ROE: string | null;
};

export async function getFinSummary(symbol: string): Promise<JQFinSummary[]> {
  const code = toJQuantsCode(symbol);
  const data = await jquantsGet(`/fins/summary?code=${code}`) as {
    data: JQFinSummary[];
    pagination_key?: string;
  };
  let rows = data.data || [];
  let paginationKey = data.pagination_key;

  while (paginationKey) {
    const next = await jquantsGet(
      `/fins/summary?code=${code}&pagination_key=${encodeURIComponent(paginationKey)}`
    ) as { data: JQFinSummary[]; pagination_key?: string };
    rows = rows.concat(next.data || []);
    paginationKey = next.pagination_key;
  }

  return rows;
}

function parseNum(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export type ParsedFinSummary = {
  disclosedDate: Date;
  periodType: string;
  fiscalYear: number;
  quarter: number | null;
  revenue: number | null;
  operatingProfit: number | null;
  ordinaryProfit: number | null;
  netProfit: number | null;
  eps: number | null;
  bps: number | null;
  totalAssets: number | null;
  equity: number | null;
  equityRatio: number | null;
  roe: number | null;
  divAnn: number | null;
  divFY: number | null;
  payoutRatio: number | null;
  fDivAnn: number | null;
};

export function parseFinSummary(s: JQFinSummary): ParsedFinSummary {
  const quarterMap: Record<string, number | null> = {
    "1Q": 1, "2Q": 2, "3Q": 3, "FY": null, "H1": null, "H2": null,
  };
  const fy = new Date(s.CurFYEn).getFullYear();
  const raw = s as unknown as Record<string, string | null>;
  return {
    disclosedDate: new Date(s.DiscDate),
    periodType: s.CurPerType,
    fiscalYear: fy,
    quarter: quarterMap[s.CurPerType] ?? null,
    revenue: parseNum(s.Sales),
    operatingProfit: parseNum(s.OP),
    ordinaryProfit: parseNum(s.OdP),
    netProfit: parseNum(s.NP),
    eps: parseNum(s.EPS),
    bps: parseNum(s.BPS),
    totalAssets: parseNum(s.TA),
    equity: parseNum(s.Eq),
    equityRatio: parseNum(s.EqAR),
    roe: parseNum(s.ROE),
    divAnn: parseNum(raw["DivAnn"]),
    divFY: parseNum(raw["DivFY"]),
    payoutRatio: parseNum(raw["PayoutRatioAnn"]),
    fDivAnn: parseNum(raw["FDivAnn"]),
  };
}
