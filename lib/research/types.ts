// ── Deep Research · Research Engine 类型（P17 Phase 3）───────────────────────
// 单一引擎九产业共用的统一研究负载（IndustryResearch）。Provider 产出此结构，
// engine 负责落库（Entity→Claim→Evidence→Graph→Version→Review→Report→StockLink）。

export type Confidence = "HIGH" | "MID" | "LOW";
export type ChainLayer = "UPSTREAM" | "MIDSTREAM" | "DOWNSTREAM" | "INFRASTRUCTURE" | "APPLICATION";
export type ChokeLevel = "MONOPOLY" | "NEAR_MONOPOLY" | "STRONG" | "REPLACEABLE" | "NONE";
export type BottleneckLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type NodeType = "COMPANY" | "SEGMENT" | "TECHNOLOGY" | "INDUSTRY";
export type EdgeType = "SUPPLY" | "DEPEND" | "COMPETE" | "SUBSTITUTE" | "EQUIPMENT" | "MATERIAL" | "CAPACITY" | "POLICY" | "CUSTOMER";
export type SourceType = "FILING" | "EARNINGS" | "MIDTERM_PLAN" | "EXCHANGE" | "GOV" | "PATENT" | "PAPER" | "INDUSTRY_REPORT" | "NEWS" | "OFFICIAL" | "INTERVIEW" | "SUPPLY_CHAIN";

// 证据（绑定到 Claim）
export interface EvidenceInput {
  sourceTitle: string;
  publisher?: string;
  sourceType: SourceType;
  url?: string;
  publishedAt?: string; // ISO
  language?: string;
  country?: string;
  confidence?: Confidence;
  evidenceSummary?: string;
}

// 主张/断言（无证据 → engine 强制 confidence=LOW）
export interface ClaimInput {
  claimType?: string; // SHARE|MOAT|ROADMAP|RISK|GROWTH|CHOKEPOINT|CUSTOMER
  statement: string;
  confidence?: Confidence;
  importance?: number; // 1-10
  evidence?: EvidenceInput[];
}

export interface SegmentInput {
  segmentKey: string;
  layer: ChainLayer;
  nameZh: string;
  nameEn?: string;
  nameJa?: string;
  chokeSummary?: string;
  sortOrder?: number;
}

export interface TechnologyInput {
  techKey: string;
  name: string;
  description?: string;
  currentSolution?: string;
  nextGen?: string;
  commercialStage?: string; // LAB|EARLY|RAMP|MASS
  maturity?: number;
  difficulty?: number;
  leaderCountry?: string;
  leaderCompany?: string;
  altTech?: string;
  roadmap?: { year: string; milestone: string; status: string }[];
  uncertainty?: string;
  claims?: ClaimInput[];
}

export interface HiddenChampionInput {
  score: number; // 0-100
  dimensions: Record<string, number>; // 12 维
  verdict: "CANDIDATE" | "CONFIRMED" | "REJECTED";
  reasons?: string;
  mainRisk?: string;
  watchlistCandidate?: boolean;
}

export interface CompanyInput {
  companyKey: string;
  symbol?: string; // → StockScore（只读指针；null=非上市/海外/机构）
  name: string;
  nameZh?: string;
  nameEn?: string;
  country: string;
  market?: string;
  listed: boolean;
  entityType?: "COMPANY" | "FOREIGN" | "UNLISTED" | "GOV" | "UNIVERSITY";
  coreProduct?: string;
  coreTech?: string;
  globalSharePct?: number | null;
  moat?: string;
  altDifficulty?: ChokeLevel;
  customers?: string;
  suppliers?: string;
  competitors?: string;
  growthDriver?: string;
  futureRisk?: string;
  whyMatters?: string;
  chainImpact?: string;
  roadmap?: { year: string; milestone: string; status: string }[];
  investmentValue?: { tech: number; pos: number; growth: number; val: number; risk: number; rating: string; catalysts?: string; upside12m?: string; risk12m?: string; conclusion?: string };
  isHiddenChampion?: boolean;
  segmentKeys?: string[];
  techKeys?: string[];
  industryRole?: string;
  benefitScore?: number;
  hiddenChampion?: HiddenChampionInput;
  claims?: ClaimInput[];
}

export interface BottleneckInput {
  name: string;
  dims: Record<string, number>; // 10 维
  level: BottleneckLevel;
  whyBottleneck?: string;
  controlledBy?: string;
  dependents?: string;
  hasAlternative?: string;
  jpBeneficiary?: string;
  jpSymbols?: string[];
  triggers?: string;
  claims?: ClaimInput[];
}

export interface EdgeInput {
  fromType: NodeType;
  fromKey: string;
  toType: NodeType;
  toKey: string;
  edgeType: EdgeType;
  directed?: boolean;
  strength?: number; // 0-100
  note?: string;
}

// 统一研究负载
export interface IndustryResearch {
  industry: {
    industryKey: string;
    nameZh: string;
    nameEn: string;
    nameJa: string;
    oneLiner?: string;
    summary?: string;
    metrics?: Record<string, number>; // 9 维
    sortOrder?: number;
  };
  segments: SegmentInput[];
  technologies: TechnologyInput[];
  companies: CompanyInput[];
  bottlenecks: BottleneckInput[];
  edges: EdgeInput[];
}

// Provider 产出 + 用量
export interface ResearchResult {
  data: IndustryResearch;
  usage: { provider: string; model: string; promptTokens: number; completionTokens: number; totalTokens: number; estimatedCost: number; durationMs: number };
  sourceKind: "SEED" | "LLM"; // 决定初始版本状态
}

export interface ResearchProvider {
  name: string;
  research(industryKey: string): Promise<ResearchResult>;
}
