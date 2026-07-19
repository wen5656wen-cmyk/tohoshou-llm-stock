"use client";

// 知识图谱专业可视化（P17 Phase 6）· React Flow v12 · 消费现有 Graph API · 不新增节点/边模型
import { useCallback, useMemo } from "react";
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, MarkerType, type Node, type Edge, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/lib/decision/ds";

/* eslint-disable @typescript-eslint/no-explicit-any */
type GNode = { id: string; type: string; label: string; group: string | null; meta: any };
type GEdge = { id: string; source: string; target: string; sourceType: string; targetType: string; type: string; directed: boolean; strength: number; label: string | null };
export type GraphData = { nodes: GNode[]; edges: GEdge[]; stats?: any };

const TYPE_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  COMPANY: { bg: "#EAF3FF", border: COLORS.primary, text: "#0B5CAD" },
  SEGMENT: { bg: "#F0EEFF", border: COLORS.purple, text: "#4B3FC4" },
  TECHNOLOGY: { bg: "#E8FBF4", border: COLORS.success, text: "#0E7A55" },
};
const EDGE_TONE: Record<string, string> = { SUPPLY: COLORS.primary, EQUIPMENT: COLORS.purple, MATERIAL: COLORS.success, DEPEND: COLORS.textMuted, COMPETE: COLORS.danger, SUBSTITUTE: COLORS.warning, CAPACITY: "#0E7A55", POLICY: COLORS.textFaint, CUSTOMER: COLORS.primary };
const LAYER_COL: Record<string, number> = { UPSTREAM: 0, MIDSTREAM: 1, DOWNSTREAM: 2, INFRASTRUCTURE: 3, APPLICATION: 4, TECH: 0, null: 1 };
const COLW = 240, ROWH = 62;

// 自定义节点：公司(可掐脖子红环/隐冠💎)、环节、技术
function RNode({ data }: NodeProps) {
  const d = data as any;
  const st = TYPE_STYLE[d.ntype] ?? TYPE_STYLE.SEGMENT;
  const choke = d.ntype === "COMPANY" && d.meta?.chokehold && ["MONOPOLY", "NEAR_MONOPOLY"].includes(d.meta.chokehold);
  return (
    <div style={{ background: st.bg, border: `1.5px solid ${choke ? COLORS.danger : st.border}`, borderRadius: 9, padding: "6px 10px", minWidth: 132, maxWidth: 210, boxShadow: choke ? `0 0 0 3px ${COLORS.danger}22` : "0 1px 3px rgba(17,24,39,.08)" }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ fontSize: 11.5, fontWeight: 700, color: st.text, lineHeight: 1.25 }}>
        {d.ntype === "COMPANY" && d.meta?.hiddenChampion && <span>💎 </span>}
        {d.label}
      </div>
      {d.ntype === "COMPANY" && d.meta?.symbol && <div style={{ fontSize: 9, fontFamily: "ui-monospace,monospace", color: COLORS.textFaint, marginTop: 1 }}>{d.meta.symbol}{d.meta.listed ? "" : " ·未上市"}</div>}
      {d.ntype !== "COMPANY" && <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".04em", color: st.border, marginTop: 1 }}>{d.ntype}</div>}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}
const nodeTypes = { rnode: RNode };

function layout(nodes: GNode[]): Node[] {
  const col = (n: GNode) => LAYER_COL[String(n.type === "TECHNOLOGY" ? "TECH" : n.group ?? "null")] ?? 1;
  const bandCounter: Record<string, number> = {};
  // 三段：SEGMENT 顶 / COMPANY 中 / TECHNOLOGY 底
  const segRows = Math.max(1, ...Object.values(nodes.filter((n) => n.type === "SEGMENT").reduce((a, n) => { const c = col(n); a[c] = (a[c] ?? 0) + 1; return a; }, {} as Record<number, number>)), 1);
  const coRows = Math.max(1, ...Object.values(nodes.filter((n) => n.type === "COMPANY").reduce((a, n) => { const c = col(n); a[c] = (a[c] ?? 0) + 1; return a; }, {} as Record<number, number>)), 1);
  const bandTop: Record<string, number> = { SEGMENT: 0, COMPANY: segRows * ROWH + 90, TECHNOLOGY: (segRows + coRows) * ROWH + 180 };
  return nodes.map((n) => {
    const c = col(n); const band = n.type; const key = `${band}:${c}`;
    const idx = bandCounter[key] ?? 0; bandCounter[key] = idx + 1;
    return { id: n.id, type: "rnode", position: { x: c * COLW, y: (bandTop[band] ?? 0) + idx * ROWH }, data: { label: n.label, ntype: n.type, meta: n.meta } };
  });
}

export default function KnowledgeGraph({ graph, onNodeClick }: { graph: GraphData; onNodeClick?: (id: string, meta: any) => void }) {
  const { t } = useI18n();
  const rfNodes = useMemo(() => layout(graph.nodes), [graph.nodes]);
  const rfEdges = useMemo<Edge[]>(() => graph.edges.map((e) => ({
    id: e.id, source: e.source, target: e.target, label: e.label ?? undefined,
    animated: ["SUPPLY", "EQUIPMENT", "MATERIAL"].includes(e.type),
    style: { stroke: EDGE_TONE[e.type] ?? COLORS.textMuted, strokeWidth: Math.max(1, Math.min(3, (e.strength ?? 50) / 40)) },
    labelStyle: { fontSize: 9, fill: COLORS.textMuted }, labelBgStyle: { fill: COLORS.card, fillOpacity: 0.8 },
    markerEnd: e.directed ? { type: MarkerType.ArrowClosed, color: EDGE_TONE[e.type] ?? COLORS.textMuted } : undefined,
  })), [graph.edges]);

  const handleClick = useCallback((_: unknown, node: Node) => { onNodeClick?.(node.id, (node.data as any).meta); }, [onNodeClick]);
  const mmColor = useCallback((n: Node) => (TYPE_STYLE[(n.data as any).ntype]?.border ?? COLORS.border), []);

  if (!graph.nodes.length) return <div style={{ padding: 30, textAlign: "center", fontSize: 12, color: COLORS.textFaint }}>{t("dr.kg.empty")}</div>;

  return (
    <div style={{ height: 480, borderRadius: 12, overflow: "hidden", border: `1px solid ${COLORS.border}`, background: "#FBFCFD" }}>
      <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} onNodeClick={handleClick} fitView minZoom={0.2} maxZoom={2} proOptions={{ hideAttribution: true }} nodesDraggable nodesConnectable={false} elementsSelectable>
        <Background color={COLORS.borderSoft} gap={22} />
        <Controls showInteractive={false} />
        <MiniMap nodeColor={mmColor} nodeStrokeWidth={2} pannable zoomable style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }} />
      </ReactFlow>
    </div>
  );
}
