// ── Deep Research V2 · Canonical Dictionary（P17 V2 · Schema 对齐）──────────────
// 以 V1 黄金路径为真值源 + 扩展 AI 半导体规范键。模型只能引用这些 Key，禁止自由命名。
// 用于：Prompt 注入（约束）· Post-Processor（映射/丢弃非规范键）· Benchmark（语义对比）。
// 不新增数据结构/页面/功能；仅规范键字典。
export const CANONICAL_LAYERS = ["UPSTREAM", "MIDSTREAM", "DOWNSTREAM", "INFRASTRUCTURE", "APPLICATION"] as const;
export const CANONICAL_CLAIM_TYPES = ["SHARE", "MOAT", "ROADMAP", "RISK", "GROWTH", "CHOKEPOINT", "CUSTOMER", "CAPACITY"] as const;
export const MATERIAL_CLAIM_TYPES = new Set(["SHARE", "MOAT", "CHOKEPOINT", "ROADMAP", "CAPACITY"]);
export const CANONICAL_EDGE_TYPES = ["SUPPLY", "DEPEND", "COMPETE", "SUBSTITUTE", "EQUIPMENT", "MATERIAL", "CAPACITY", "POLICY", "CUSTOMER"] as const;

export interface CanonSeg { segmentKey: string; layer: string; nameZh: string; aliases: string[] }
export interface CanonTech { techKey: string; name: string; aliases: string[] }

// AI 半导体规范环节（V1 的 7 个 + 补充规范环节）
const AI_SEMI_SEGMENTS: CanonSeg[] = [
  { segmentKey: "photoresist", layer: "UPSTREAM", nameZh: "光刻胶", aliases: ["光刻胶", "resist", "photoresist", "euv resist"] },
  { segmentKey: "wafer", layer: "UPSTREAM", nameZh: "硅晶圆", aliases: ["硅晶圆", "silicon wafer", "wafer substrate", "晶圆"] },
  { segmentKey: "gases_chemicals", layer: "UPSTREAM", nameZh: "电子材料/特气", aliases: ["特气", "电子材料", "specialty gases", "electronic chemicals", "cmp slurry", "precursor"] },
  { segmentKey: "litho", layer: "MIDSTREAM", nameZh: "光刻机", aliases: ["光刻机", "lithography", "scanner", "litho tool"] },
  { segmentKey: "equipment", layer: "MIDSTREAM", nameZh: "前道设备", aliases: ["前道设备", "wfe", "front-end equipment", "deposition", "etch", "cvd", "pvd", "cmp tool"] },
  { segmentKey: "dicing", layer: "MIDSTREAM", nameZh: "切割/研磨", aliases: ["切割", "研磨", "grinder", "dicer", "back-end equipment", "singulation"] },
  { segmentKey: "inspection", layer: "APPLICATION", nameZh: "检测/测试", aliases: ["检测", "测试", "metrology", "inspection", "test", "ate", "prober"] },
  { segmentKey: "packaging", layer: "DOWNSTREAM", nameZh: "先进封装", aliases: ["先进封装", "advanced packaging", "osat", "assembly", "cowos", "2.5d", "3d ic"] },
  { segmentKey: "foundry", layer: "DOWNSTREAM", nameZh: "代工/器件", aliases: ["代工", "晶圆代工", "foundry", "idm", "器件"] },
  { segmentKey: "memory", layer: "DOWNSTREAM", nameZh: "存储", aliases: ["存储", "hbm", "dram", "nand", "memory"] },
  { segmentKey: "eda_ip", layer: "INFRASTRUCTURE", nameZh: "EDA/IP", aliases: ["eda", "ip", "design tools", "设计工具"] },
];

// AI 半导体技术词典（V1 的 4 个 + 用户指定 HBM/CoWoS/Chiplet/SiC/GaN/Photonics/AI Server 等）
const AI_SEMI_TECHS: CanonTech[] = [
  { techKey: "euv_litho", name: "EUV 光刻", aliases: ["euv", "euv lithography", "extreme ultraviolet", "euv 光刻", "high-na euv"] },
  { techKey: "euv_resist", name: "EUV 光刻胶", aliases: ["euv resist", "euv photoresist", "euv 光刻胶"] },
  { techKey: "hybrid_bonding", name: "混合键合", aliases: ["hybrid bonding", "混合键合", "wafer bonding"] },
  { techKey: "mask_inspection", name: "掩膜检测", aliases: ["mask inspection", "reticle inspection", "掩膜检测", "photomask inspection"] },
  { techKey: "hbm", name: "高带宽存储 HBM", aliases: ["hbm", "high bandwidth memory", "高带宽存储", "hbm3", "hbm4"] },
  { techKey: "advanced_packaging", name: "先进封装", aliases: ["advanced packaging", "先进封装", "2.5d", "3d ic", "fan-out"] },
  { techKey: "cowos", name: "CoWoS", aliases: ["cowos", "chip on wafer on substrate", "chip-on-wafer-on-substrate"] },
  { techKey: "chiplet", name: "Chiplet", aliases: ["chiplet", "小芯片", "die-to-die", "ucie"] },
  { techKey: "power_semi", name: "功率半导体", aliases: ["power semiconductor", "功率半导体", "power device", "igbt"] },
  { techKey: "sic", name: "碳化硅 SiC", aliases: ["sic", "silicon carbide", "碳化硅"] },
  { techKey: "gan", name: "氮化镓 GaN", aliases: ["gan", "gallium nitride", "氮化镓"] },
  { techKey: "photonics", name: "硅光/光互连", aliases: ["photonics", "silicon photonics", "硅光", "光模块", "co-packaged optics", "cpo", "光子"] },
  { techKey: "ai_server", name: "AI 服务器", aliases: ["ai server", "ai 服务器", "accelerator", "gpu server", "ai accelerator"] },
  { techKey: "cmp", name: "化学机械抛光 CMP", aliases: ["cmp", "chemical mechanical planarization", "化学机械抛光"] },
  { techKey: "deposition", name: "薄膜沉积", aliases: ["deposition", "cvd", "pvd", "ald", "薄膜沉积"] },
  { techKey: "etch", name: "刻蚀", aliases: ["etch", "刻蚀", "dry etch", "plasma etch"] },
];

// ── AI 数据中心规范环节（7 段：算力硬件/服务器/网络/散热/供电/设施/云）──
const AI_DC_SEGMENTS: CanonSeg[] = [
  { segmentKey: "compute_hardware", layer: "UPSTREAM", nameZh: "算力硬件/芯片载板", aliases: ["算力硬件", "compute hardware", "gpu", "accelerator", "ai chip", "cpu", "ic substrate", "载板", "封装载板", "abf"] },
  { segmentKey: "server_system", layer: "MIDSTREAM", nameZh: "AI 服务器/机架整机", aliases: ["ai server", "gpu server", "server", "服务器", "rack", "机架", "整机", "rack scale", "机架级"] },
  { segmentKey: "dc_network", layer: "MIDSTREAM", nameZh: "数据中心网络/光互连", aliases: ["数据中心网络", "data center network", "datacenter network", "network", "ethernet", "以太网", "infiniband", "spine-leaf", "spine leaf", "光互连", "optical interconnect", "光缆", "connector", "switch", "交换机"] },
  { segmentKey: "cooling", layer: "INFRASTRUCTURE", nameZh: "散热/液冷/风冷", aliases: ["散热", "冷却", "cooling", "thermal", "liquid cooling", "液冷", "air cooling", "风冷", "immersion", "浸没", "hvac", "空调"] },
  { segmentKey: "power_infra", layer: "INFRASTRUCTURE", nameZh: "供配电/UPS/变压器", aliases: ["供电", "配电", "供配电", "power", "power infrastructure", "power distribution", "ups", "变压器", "transformer", "switchgear", "pdu", "电力"] },
  { segmentKey: "dc_facility", layer: "INFRASTRUCTURE", nameZh: "数据中心建设/托管/边缘", aliases: ["数据中心建设", "data center facility", "colocation", "托管", "colo", "facility", "edge data center", "边缘数据中心", "construction", "建设"] },
  { segmentKey: "hyperscale_cloud", layer: "DOWNSTREAM", nameZh: "超大规模/云基础设施", aliases: ["超大规模", "hyperscaler", "hyperscale", "cloud", "云", "cloud infrastructure", "云基础设施", "iaas", "gpu cloud", "gpu 云"] },
];

// ── AI 数据中心技术词典（14 项，覆盖用户 16 个重点方向）──
const AI_DC_TECHS: CanonTech[] = [
  { techKey: "ai_server", name: "AI/GPU 服务器", aliases: ["ai server", "gpu server", "ai 服务器", "gpu 服务器", "accelerated server", "hgx"] },
  { techKey: "rack_scale", name: "机架级架构", aliases: ["rack scale", "rack-scale", "机架级", "nvl72", "gb200", "superpod", "机架级架构"] },
  { techKey: "dc_ethernet", name: "数据中心以太网", aliases: ["ethernet", "以太网", "ultra ethernet", "roce", "spine-leaf", "spine leaf", "clos", "数据中心以太网"] },
  { techKey: "infiniband", name: "InfiniBand/NVLink", aliases: ["infiniband", "ib", "nvlink", "nvl", "低时延互连"] },
  { techKey: "liquid_cooling", name: "液冷", aliases: ["liquid cooling", "液冷", "direct-to-chip", "d2c", "dlc", "cold plate", "冷板"] },
  { techKey: "immersion_cooling", name: "浸没式冷却", aliases: ["immersion cooling", "immersion", "浸没", "two-phase", "两相"] },
  { techKey: "air_cooling", name: "风冷/空调", aliases: ["air cooling", "风冷", "crac", "crah", "hvac", "空调", "机房空调"] },
  { techKey: "power_distribution", name: "供配电", aliases: ["power distribution", "供配电", "配电", "busway", "pdu", "switchgear", "hvdc", "母线"] },
  { techKey: "ups_backup", name: "UPS/后备电源", aliases: ["ups", "后备电源", "uninterruptible power", "battery backup", "bess", "储能", "不间断电源"] },
  { techKey: "transformer", name: "变压器/变电", aliases: ["transformer", "变压器", "substation", "变电", "输配电"] },
  { techKey: "optical_interconnect", name: "光互连/光缆", aliases: ["optical interconnect", "光互连", "optical fiber", "光纤", "光缆", "dac", "aec", "cpo", "co-packaged optics", "共封装光学", "光模块", "connector", "连接器"] },
  { techKey: "edge_datacenter", name: "边缘数据中心", aliases: ["edge data center", "edge datacenter", "边缘数据中心", "边缘", "micro data center", "edge dc"] },
  { techKey: "ic_substrate", name: "IC 封装载板", aliases: ["ic substrate", "abf substrate", "package substrate", "封装载板", "载板", "abf", "玻璃基板", "glass substrate"] },
  { techKey: "cloud_infra", name: "云基础设施", aliases: ["cloud infrastructure", "云基础设施", "hyperscale", "iaas", "云", "gpu cloud", "主权云", "sovereign cloud"] },
];

export const CANONICAL_SEGMENTS: Record<string, CanonSeg[]> = { AI_SEMICONDUCTOR: AI_SEMI_SEGMENTS, AI_DATACENTER: AI_DC_SEGMENTS };
export const CANONICAL_TECHNOLOGIES: Record<string, CanonTech[]> = { AI_SEMICONDUCTOR: AI_SEMI_TECHS, AI_DATACENTER: AI_DC_TECHS };

const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9一-鿿]/g, "");
function resolve<T extends { aliases: string[]; name?: string }>(list: T[], keyField: (t: T) => string, input?: string): string | null {
  if (!input) return null;
  const n = norm(input);
  if (!n) return null;
  for (const t of list) { if (norm(keyField(t)) === n || (t.name && norm(t.name) === n) || t.aliases.some((a) => norm(a) === n)) return keyField(t); }
  // 次级：包含匹配（别名长度≥3，避免误配）
  for (const t of list) { if (t.aliases.some((a) => { const na = norm(a); return na.length >= 3 && (n.includes(na) || na.includes(n)); })) return keyField(t); }
  return null;
}
export function resolveSegment(industryKey: string, keyOrName?: string): string | null {
  return resolve(CANONICAL_SEGMENTS[industryKey] ?? [], (s) => s.segmentKey, keyOrName);
}
export function resolveTech(industryKey: string, keyOrName?: string): string | null {
  return resolve(CANONICAL_TECHNOLOGIES[industryKey] ?? [], (t) => t.techKey, keyOrName);
}
export function segmentLayer(industryKey: string, segmentKey: string): string | null {
  return (CANONICAL_SEGMENTS[industryKey] ?? []).find((s) => s.segmentKey === segmentKey)?.layer ?? null;
}
export function techName(industryKey: string, techKey: string): string | null {
  return (CANONICAL_TECHNOLOGIES[industryKey] ?? []).find((t) => t.techKey === techKey)?.name ?? null;
}

// Prompt 注入文本：强制模型只用规范键
export function canonicalDictText(industryKey: string): string {
  const segs = CANONICAL_SEGMENTS[industryKey] ?? [];
  const techs = CANONICAL_TECHNOLOGIES[industryKey] ?? [];
  return `=== CANONICAL DICTIONARY (you MUST use ONLY these keys; do NOT invent new keys) ===
ALLOWED segmentKey (with layer): ${segs.map((s) => `${s.segmentKey}[${s.layer}]`).join(", ")}
ALLOWED techKey: ${techs.map((t) => `${t.techKey}(${t.name})`).join(", ")}
ALLOWED claimType: ${CANONICAL_CLAIM_TYPES.join(", ")}
ALLOWED edgeType: ${CANONICAL_EDGE_TYPES.join(", ")}
ALLOWED layer: ${CANONICAL_LAYERS.join(", ")}
Rules:
- company.segmentKeys / company.techKeys / segment.segmentKey / technology.techKey MUST be from the lists above.
- If a real company/tech does not fit an existing key, map it to the closest ALLOWED key; NEVER create a new key.
- Every claim MUST include: claimType (from ALLOWED claimType), importance (1-10 integer), confidence (HIGH|MID|LOW), and at least ONE evidence with sourceTitle + sourceType. A claim without evidence MUST be omitted or set confidence=LOW.
- edges MUST NOT duplicate: the same (fromKey, toKey, edgeType) appears at most once.`;
}
