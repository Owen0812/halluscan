"use client";

import { useAppStore } from "@/lib/store";
import AgentCard from "./AgentCard";

const PARALLEL_NODES = new Set(["compliance", "factcheck", "tone"]);

export default function AgentTimeline() {
  const { nodes, phase, blockedReason } = useAppStore();

  if (phase === "idle") return null;

  // Split nodes into: before-parallel, parallel group, after-parallel
  const before = nodes.filter((n) => !PARALLEL_NODES.has(n.node) && ["guardian", "orchestrator", "memory_retrieve"].includes(n.node));
  const parallel = nodes.filter((n) => PARALLEL_NODES.has(n.node));
  const after = nodes.filter((n) => ["verdict", "fix", "memory_save"].includes(n.node));

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Agent 执行进度</h2>

      {/* Sequential nodes before parallel */}
      {before.map((n) => (
        <AgentCard key={n.node} node={n} />
      ))}

      {/* Parallel group */}
      {parallel.length > 0 && (
        <div className="relative">
          <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-200" />
          <div className="grid grid-cols-3 gap-2 pl-0">
            {parallel.map((n) => (
              <AgentCard key={n.node} node={n} />
            ))}
          </div>
        </div>
      )}

      {/* Sequential nodes after parallel */}
      {after.map((n) => (
        <AgentCard key={n.node} node={n} />
      ))}

      {/* Blocked state */}
      {phase === "blocked" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span className="font-semibold">🚫 已拦截：</span>{blockedReason}
        </div>
      )}
    </div>
  );
}
