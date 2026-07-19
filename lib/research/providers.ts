// ── Deep Research · Provider + Capability 架构（P17 Track 2）─────────────────
// Research Engine 只认统一接口(ResearchProvider) + 能力位(ProviderCapabilities)，
// 绝不知道 Anthropic/OpenAI/Claude 任何厂商细节；模型只由环境变量决定，禁写死。
//   能力驱动：Engine 依据 capabilities 自动决定是否启用 thinking / web search / structured output。
//   Web Search 解耦：Provider 自带 search 或未来第三方 EvidenceSource，统一产出 Evidence/Source/Citation。
//   Structured Output 由统一 Research Schema 控制，所有 Provider 最终输出同一 IndustryResearch payload。
// 统一能力：可用性检查·超时·重试·结构化校验·用量·成本·时长·原始审计·优雅降级·任务失败隔离。
// ⚠️ 不修改 lib/openai.ts / Research Engine / Stock Center / Decision Center。密钥仅从环境读取，绝不入日志/Git。
import { openaiClient } from "../openai";
import type { EvidenceInput, IndustryResearch, ResearchProvider, ResearchResult } from "./types";

export type ProviderKind = "openai" | "anthropic" | "seed";
export type ModelRole = "default" | "daily" | "strong";

// ── §7 Capability Layer ──────────────────────────────────────────────────
export interface ProviderCapabilities {
  supportsThinking: boolean;
  supportsWebSearch: boolean;
  supportsStructuredOutput: boolean;
  supportsVision: boolean;
  supportsToolUse: boolean;
  supportsLongContext: boolean;
}

// ── §4 EvidenceSource seam：Provider 自带 search 或未来第三方 search，统一返回 Evidence ──
export interface EvidenceSource {
  name: string;
  search(query: string, opts?: { max?: number }): Promise<EvidenceInput[]>;
}

// ── 成本表（USD / 1K tokens，可扩展；仅估算，真实以账单为准）。非"写死使用模型"——模型由 env 决定。 ──
const COST: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 }, "gpt-4o": { in: 0.0025, out: 0.01 }, "gpt-4.1": { in: 0.002, out: 0.008 },
  "claude-opus-4-8": { in: 0.005, out: 0.025 }, "claude-opus-4-7": { in: 0.005, out: 0.025 }, "claude-sonnet-5": { in: 0.003, out: 0.015 }, "claude-fable-5": { in: 0.01, out: 0.05 },
  default: { in: 0.002, out: 0.008 },
};
export function estimateCost(model: string, pt: number, ct: number): number {
  const c = COST[model] ?? COST.default;
  return +((pt / 1000) * c.in + (ct / 1000) * c.out).toFixed(4);
}

// ── §5 统一 system prompt（provider 无关，保证 benchmark 公平 + 统一 payload）──
export const RESEARCH_SYSTEM = `You are a senior equity research analyst specializing in AI industry supply chains and Japanese listed companies.
Output STRICT JSON only, matching the requested schema. Rules:
- Focus on AI-related industries and identify which JAPANESE LISTED companies benefit and why.
- Map upstream/midstream/downstream, technology chokepoints, hidden champions.
- Every material claim (market share, monopoly, moat, roadmap) MUST include evidence with a real source type; if you cannot ground a claim, set its confidence to "LOW".
- Never fabricate precise figures without a source. Prefer ranges + LOW confidence over false precision.
- Use Japanese company legal names; include stock symbol in NNNN.T form (e.g. 6920.T) ONLY for listed JP companies; foreign/unlisted → symbol null, listed false.`;

export function buildUserPrompt(industryKey: string, sourcePack?: string): string {
  const base = `Produce a deep research payload for the AI industry line "${industryKey}" as JSON with keys: industry, segments[], technologies[], companies[], bottlenecks[], edges[]. Follow the IndustryResearch schema. Emphasize Japanese listed beneficiaries, technology chokepoints, hidden champions, and evidence-bound claims.`;
  return sourcePack ? `${base}\n\n=== SOURCE PACK (ground your claims in these; cite as evidence) ===\n${sourcePack}` : base;
}

// ── §5 结构化输出校验（provider 无关，统一 schema / 审核口径）──
export interface ValidationReport {
  schemaValid: boolean; errors: string[]; warnings: string[];
  stats: { segments: number; technologies: number; companies: number; jpListed: number; bottlenecks: number; edges: number; claims: number; evidence: number; symbolErrors: number; noEvidenceCertainClaims: number; duplicateEdges: number };
}
const SYM_RE = /^[0-9A-Z]{4}\.T$/; // 日本股票代码：4 位字母数字 + .T（2024 起支持字母，如 Kioxia 285A.T）
function isObj(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object" && !Array.isArray(x); }
export function validateIndustryResearch(data: unknown): ValidationReport {
  const errors: string[] = [], warnings: string[] = [];
  const s = { segments: 0, technologies: 0, companies: 0, jpListed: 0, bottlenecks: 0, edges: 0, claims: 0, evidence: 0, symbolErrors: 0, noEvidenceCertainClaims: 0, duplicateEdges: 0 };
  if (!isObj(data)) { errors.push("root is not an object"); return { schemaValid: false, errors, warnings, stats: s }; }
  const d = data as Partial<IndustryResearch>;
  if (!isObj(d.industry) || !d.industry.industryKey) errors.push("missing industry.industryKey");
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const segs = arr<Record<string, unknown>>(d.segments); s.segments = segs.length;
  const techs = arr<Record<string, unknown>>(d.technologies); s.technologies = techs.length;
  const cos = arr<Record<string, unknown>>(d.companies); s.companies = cos.length;
  const bns = arr<Record<string, unknown>>(d.bottlenecks); s.bottlenecks = bns.length;
  const edges = arr<Record<string, unknown>>(d.edges); s.edges = edges.length;
  const countClaims = (claims: unknown) => {
    for (const cl of arr<Record<string, unknown>>(claims)) {
      s.claims++; const ev = arr<unknown>(cl.evidence); s.evidence += ev.length;
      const conf = String(cl.confidence ?? "").toUpperCase();
      if ((conf === "HIGH" || conf === "MID") && ev.length === 0) s.noEvidenceCertainClaims++;
    }
  };
  for (const c of cos) { const listed = c.listed === true; const sym = typeof c.symbol === "string" ? c.symbol : null; if (listed) { s.jpListed++; if (!sym || !SYM_RE.test(sym)) s.symbolErrors++; } countClaims(c.claims); }
  for (const t of techs) countClaims(t.claims);
  for (const b of bns) countClaims(b.claims);
  const seen = new Set<string>();
  for (const e of edges) { const k = `${e.fromKey}|${e.toKey}|${e.edgeType}`; if (seen.has(k)) s.duplicateEdges++; else seen.add(k); }
  if (!s.companies) errors.push("no companies");
  if (!s.segments) warnings.push("no segments");
  if (s.symbolErrors) warnings.push(`${s.symbolErrors} listed companies with invalid JP symbol`);
  if (s.noEvidenceCertainClaims) warnings.push(`${s.noEvidenceCertainClaims} certain claims without evidence (should be LOW)`);
  return { schemaValid: errors.length === 0, errors, warnings, stats: s };
}

// ── 统一 provider 契约（Engine 只依赖此接口 + capabilities）──
export interface AvailabilityReport { available: boolean; kind: ProviderKind; model: string | null; reason?: string; models?: string[]; }
export interface ProviderAudit { actualModel: string; requestCount: number; cachedInputTokens: number; reasoningTokens: number }
export interface ProviderRunResult extends ResearchResult { raw: string; validation: ValidationReport; attempts: number; fallbackUsed?: string; enabled: { thinking: boolean; webSearch: boolean; structuredOutput: boolean }; audit: ProviderAudit; }
// §6 Thinking 与 §4 WebSearch 均为能力驱动的可选开关（非某厂商专属）
export interface GenerateOptions { sourcePack?: string; timeoutMs?: number; retries?: number; useWebSearch?: boolean; useThinking?: boolean; }
export interface StrongProvider extends ResearchProvider {
  kind: ProviderKind;
  model: string | null;
  capabilities: ProviderCapabilities;
  checkAvailability(): Promise<AvailabilityReport>;
  run(industryKey: string, opts?: GenerateOptions): Promise<ProviderRunResult>;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> { return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms))]); }
async function withRetry<T>(fn: () => Promise<T>, retries: number, timeoutMs: number): Promise<{ value: T; attempts: number }> {
  let last: unknown;
  for (let i = 1; i <= retries + 1; i++) {
    try { const value = await withTimeout(fn(), timeoutMs); return { value, attempts: i }; }
    catch (e) { last = e; if (i <= retries) await new Promise((r) => setTimeout(r, 800 * i)); }
  }
  throw last;
}
function parseJsonLoose(raw: string): IndustryResearch {
  try { return JSON.parse(raw) as IndustryResearch; }
  catch { const m = raw.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]) as IndustryResearch; throw new Error("no JSON in response"); }
}
const enabledOf = (cap: ProviderCapabilities, opts?: GenerateOptions) => ({
  thinking: (opts?.useThinking ?? true) && cap.supportsThinking,
  webSearch: (opts?.useWebSearch ?? true) && cap.supportsWebSearch,
  structuredOutput: cap.supportsStructuredOutput,
});

// ── OpenAI provider（复用 lib/openai 的 client，不改 lib/openai.ts）──
export class OpenAIProvider implements StrongProvider {
  kind: ProviderKind = "openai";
  name = "openai";
  model: string | null;
  capabilities: ProviderCapabilities = { supportsThinking: false, supportsWebSearch: false, supportsStructuredOutput: true, supportsVision: true, supportsToolUse: true, supportsLongContext: true };
  constructor(model?: string) { this.model = model ?? process.env.RESEARCH_MODEL ?? process.env.OPENAI_MODEL ?? null; }
  async checkAvailability(): Promise<AvailabilityReport> {
    if (!process.env.OPENAI_API_KEY) return { available: false, kind: this.kind, model: this.model, reason: "OPENAI_API_KEY 未配置（服务器 .env）" };
    if (!this.model) return { available: false, kind: this.kind, model: null, reason: "未配置 RESEARCH_MODEL / OPENAI_MODEL" };
    try { const models = await openaiClient().models.list(); const ids = models.data.map((m) => m.id); return { available: ids.includes(this.model), kind: this.kind, model: this.model, models: ids, reason: ids.includes(this.model) ? undefined : `模型 ${this.model} 无访问权限` }; }
    catch (e) { return { available: false, kind: this.kind, model: this.model, reason: `模型列表检查失败: ${(e as Error).message}` }; }
  }
  async run(industryKey: string, opts?: GenerateOptions): Promise<ProviderRunResult> {
    if (!this.model) throw new Error("OpenAIProvider: 无模型（配置 RESEARCH_MODEL / RESEARCH_STRONG_MODEL）");
    const model = this.model, t0 = Date.now(), enabled = enabledOf(this.capabilities, opts);
    const { value, attempts } = await withRetry(async () =>
      // gpt-5.x / o 系列推理模型：用 max_completion_tokens；不传 temperature（仅支持默认值）。
      openaiClient().chat.completions.create({ model, messages: [{ role: "system", content: RESEARCH_SYSTEM }, { role: "user", content: buildUserPrompt(industryKey, opts?.sourcePack) }], response_format: { type: "json_object" }, max_completion_tokens: 64000 }),
      opts?.retries ?? 2, opts?.timeoutMs ?? 120000);
    const raw = value.choices[0]?.message?.content ?? "{}";
    const data = parseJsonLoose(raw);
    const u = value.usage;
    const pt = u?.prompt_tokens ?? 0, ct = u?.completion_tokens ?? 0;
    const cached = (u?.prompt_tokens_details as { cached_tokens?: number } | undefined)?.cached_tokens ?? 0;
    const reasoning = (u?.completion_tokens_details as { reasoning_tokens?: number } | undefined)?.reasoning_tokens ?? 0;
    return { data, raw, validation: validateIndustryResearch(data), attempts, enabled, sourceKind: "LLM", audit: { actualModel: value.model ?? model, requestCount: attempts, cachedInputTokens: cached, reasoningTokens: reasoning }, usage: { provider: this.name, model, promptTokens: pt, completionTokens: ct, totalTokens: pt + ct, estimatedCost: estimateCost(model, pt, ct), durationMs: Date.now() - t0 } };
  }
  async research(industryKey: string): Promise<ResearchResult> { const r = await this.run(industryKey); return { data: r.data, usage: r.usage, sourceKind: r.sourceKind }; }
}

// ── Claude provider（强模型；需 ANTHROPIC_API_KEY + RESEARCH_STRONG_MODEL）──
// 能力驱动：thinking / web_search 仅在能力位开启且未被显式关闭时启用；输出统一 IndustryResearch，经统一 validator。
export class ClaudeResearchProvider implements StrongProvider {
  kind: ProviderKind = "anthropic";
  name = "anthropic";
  model: string | null;
  capabilities: ProviderCapabilities = { supportsThinking: true, supportsWebSearch: true, supportsStructuredOutput: true, supportsVision: true, supportsToolUse: true, supportsLongContext: true };
  constructor(model?: string) { this.model = model ?? process.env.RESEARCH_STRONG_MODEL ?? null; }
  private client() {
    // 动态引入避免未装 SDK 打包报错；密钥仅从环境读取，绝不打印。
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Anthropic = require("@anthropic-ai/sdk").default;
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  async checkAvailability(): Promise<AvailabilityReport> {
    if (!process.env.ANTHROPIC_API_KEY) return { available: false, kind: this.kind, model: this.model, reason: "ANTHROPIC_API_KEY 未配置（服务器 /opt/tohoshou/.env）" };
    if (!this.model) return { available: false, kind: this.kind, model: null, reason: "未配置 RESEARCH_STRONG_MODEL" };
    try { const m = await this.client().models.retrieve(this.model); return { available: true, kind: this.kind, model: this.model, models: [m.id] }; }
    catch (e) { return { available: false, kind: this.kind, model: this.model, reason: `模型检查失败: ${(e as Error).message}` }; }
  }
  async run(industryKey: string, opts?: GenerateOptions): Promise<ProviderRunResult> {
    if (!this.model) throw new Error("ClaudeResearchProvider: 无模型（配置 RESEARCH_STRONG_MODEL）");
    const model = this.model, t0 = Date.now(), client = this.client(), enabled = enabledOf(this.capabilities, opts);
    const { value, attempts } = await withRetry(async () => {
      const req: Record<string, unknown> = {
        model, max_tokens: 32000, output_config: { effort: "high" },
        system: RESEARCH_SYSTEM,
        messages: [{ role: "user", content: buildUserPrompt(industryKey, opts?.sourcePack) + "\n\nReturn ONLY the JSON object, no prose." }],
      };
      if (enabled.thinking) req.thinking = { type: "adaptive" };
      if (enabled.webSearch) req.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }];
      const stream = client.messages.stream(req);
      return stream.finalMessage();
    }, opts?.retries ?? 1, opts?.timeoutMs ?? 600000);
    const raw = (value.content as Array<{ type: string; text?: string }>).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const data = parseJsonLoose(raw);
    const pt = value.usage?.input_tokens ?? 0, ct = value.usage?.output_tokens ?? 0;
    const cached = value.usage?.cache_read_input_tokens ?? 0;
    return { data, raw, validation: validateIndustryResearch(data), attempts, enabled, sourceKind: "LLM", audit: { actualModel: value.model ?? model, requestCount: attempts, cachedInputTokens: cached, reasoningTokens: 0 }, usage: { provider: this.name, model, promptTokens: pt, completionTokens: ct, totalTokens: pt + ct, estimatedCost: estimateCost(model, pt, ct), durationMs: Date.now() - t0 } };
  }
  async research(industryKey: string): Promise<ResearchResult> { const r = await this.run(industryKey); return { data: r.data, usage: r.usage, sourceKind: r.sourceKind }; }
}

// ── Seed provider（人工核验；产出 sourceKind=SEED → 直接可 PUBLISHED；作 benchmark 参照真值）──
import { SEEDS } from "./provider-seed";
export class SeedProvider implements StrongProvider {
  kind: ProviderKind = "seed";
  name = "seed";
  model = null;
  capabilities: ProviderCapabilities = { supportsThinking: false, supportsWebSearch: false, supportsStructuredOutput: true, supportsVision: false, supportsToolUse: false, supportsLongContext: false };
  async checkAvailability(): Promise<AvailabilityReport> { return { available: true, kind: this.kind, model: null, models: Object.keys(SEEDS) }; }
  async run(industryKey: string): Promise<ProviderRunResult> {
    const t0 = Date.now(); const data = SEEDS[industryKey];
    if (!data) throw new Error(`SeedProvider: 无 ${industryKey} 种子`);
    return { data, raw: JSON.stringify(data), validation: validateIndustryResearch(data), attempts: 1, enabled: { thinking: false, webSearch: false, structuredOutput: true }, audit: { actualModel: "seed", requestCount: 1, cachedInputTokens: 0, reasoningTokens: 0 }, sourceKind: "SEED", usage: { provider: this.name, model: "seed", promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0, durationMs: Date.now() - t0 } };
  }
  async research(industryKey: string): Promise<ResearchResult> { const r = await this.run(industryKey); return { data: r.data, usage: r.usage, sourceKind: r.sourceKind }; }
}

// ── §2/§7 工厂：env 驱动（RESEARCH_PROVIDER / RESEARCH_MODEL / RESEARCH_DAILY_MODEL / RESEARCH_STRONG_MODEL），禁写死。──
export function makeProvider(kind: ProviderKind, model?: string): StrongProvider {
  if (kind === "anthropic") return new ClaudeResearchProvider(model);
  if (kind === "seed") return new SeedProvider();
  return new OpenAIProvider(model);
}
export function modelForRole(role: ModelRole): string | undefined {
  if (role === "strong") return process.env.RESEARCH_STRONG_MODEL;
  if (role === "daily") return process.env.RESEARCH_DAILY_MODEL ?? process.env.RESEARCH_MODEL;
  return process.env.RESEARCH_MODEL;
}
export function getResearchProvider(opts?: { kind?: ProviderKind; model?: string; role?: ModelRole }): StrongProvider {
  const kind = opts?.kind ?? (process.env.RESEARCH_PROVIDER as ProviderKind | undefined) ?? "openai";
  const model = opts?.model ?? (opts?.role ? modelForRole(opts.role) : undefined);
  return makeProvider(kind, model);
}
export function describeCapabilities(p: StrongProvider): Record<string, boolean> { return { ...p.capabilities }; }

// ── §优雅降级 + 任务失败隔离：strong 失败降级 fallback，单产业失败不影响其它。──
export async function runWithFallback(industryKey: string, opts?: { primary?: StrongProvider; fallback?: StrongProvider; sourcePack?: string }): Promise<ProviderRunResult> {
  const primary = opts?.primary ?? getResearchProvider({ role: "strong" });
  try { return await primary.run(industryKey, { sourcePack: opts?.sourcePack }); }
  catch (e) {
    const fb = opts?.fallback;
    if (!fb) throw new Error(`[${industryKey}] primary(${primary.kind}) failed: ${(e as Error).message}`);
    const r = await fb.run(industryKey, { sourcePack: opts?.sourcePack });
    return { ...r, fallbackUsed: `${fb.kind}:${fb.model ?? "seed"}` };
  }
}
