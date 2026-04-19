"use client";

import { AgentNode } from "@/lib/store";

const NODE_ICONS: Record<string, string> = {
  guardian: "🛡️",
  orchestrator: "🧠",
  memory_retrieve: "💾",
  compliance: "⚖️",
  factcheck: "🔍",
  tone: "📢",
  verdict: "📋",
  fix: "✏️",
  memory_save: "💿",
};

const RISK_COLOR: Record<string, string> = {
  high: "text-red-500",
  medium: "text-yellow-500",
  low: "text-green-500",
};

function DataSummary({ node, data }: { node: string; data: Record<string, unknown> }) {
  if (node === "guardian")
    return <span className={data.is_safe ? "text-green-600" : "text-red-600"}>{data.is_safe ? "安全" : "危险"}</span>;
  if (node === "orchestrator")
    return <span className="text-indigo-600">{String(data.content_type ?? "")}</span>;
  if (node === "memory_retrieve")
    return <span className="text-gray-500">检索到 {String(data.memory_count ?? 0)} 条历史案例</span>;
  if (node === "compliance")
    return (
      <span className={RISK_COLOR[String(data.risk_level)] ?? "text-gray-500"}>
        发现 {String(data.violation_count ?? 0)} 处违规 · 风险 {String(data.risk_level ?? "")}
      </span>
    );
  if (node === "factcheck")
    return (
      <span className={RISK_COLOR[String(data.risk_level)] ?? "text-gray-500"}>
        核查 {String(data.claim_count ?? 0)} 条声明 · 风险 {String(data.risk_level ?? "")}
      </span>
    );
  if (node === "tone")
    return (
      <span className={RISK_COLOR[String(data.risk_level)] ?? "text-gray-500"}>
        发现 {String(data.exaggeration_count ?? 0)} 处夸大 · 风险 {String(data.risk_level ?? "")}
      </span>
    );
  if (node === "verdict") {
    const v = String(data.verdict ?? "");
    const color = v === "违规" ? "text-red-600" : v === "存疑" ? "text-yellow-600" : "text-green-600";
    return <span className={`font-semibold ${color}`}>{v}</span>;
  }
  if (node === "fix")
    return <span className="text-green-600">已生成合规版本 ({(data.changes as string[])?.length ?? 0} 处修改)</span>;
  if (node === "memory_save")
    return <span className="text-gray-500">{data.saved ? "已保存" : "跳过"}</span>;
  return null;
}

export default function AgentCard({ node }: { node: AgentNode }) {
  const icon = NODE_ICONS[node.node] ?? "⚙️";
  const label = node.label || node.node;
  const isPending = node.status === "pending";
  const isDone = node.status === "done";

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-3 transition-all duration-300 ${
        isDone
          ? "border-gray-200 bg-white"
          : "border-dashed border-gray-200 bg-gray-50 opacity-50"
      }`}
    >
      <span className="text-xl leading-none mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${isPending ? "text-gray-400" : "text-gray-800"}`}>
            {label}
          </span>
          {isDone && (
            <span className="text-xs text-gray-400">✓</span>
          )}
        </div>
        {isDone && Object.keys(node.data).length > 0 && (
          <div className="text-xs mt-0.5">
            <DataSummary node={node.node} data={node.data} />
          </div>
        )}
        {!isDone && node.desc && (
          <div className="text-xs text-gray-400 mt-0.5">{node.desc}</div>
        )}
      </div>
    </div>
  );
}
